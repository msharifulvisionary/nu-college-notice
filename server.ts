import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

// Load environment variables
dotenv.config();

import {
  dbGetColleges,
  dbAddCollege,
  dbUpdateCollege,
  dbDeleteCollege,
  dbGetRecentNotices,
  testSupabaseConnection,
} from './src/lib/db.js';
import { runScrapeAndNotify } from './src/lib/scrapeAndNotify.ts';
import { sendTelegramMessage } from './src/lib/telegram.js';
import { scrapeCollegeNotices } from './src/lib/scraper.js';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // ==========================================
  // API Routes
  // ==========================================

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Admin Login Endpoint
  app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    const isValidNew = (username === 'msharifulvisionary@gmail.com' && password === 'ahcphysics@adminlogin');
    const isValidLegacy = (username === 'admin' || username === 'admin@college.bd') && (password === 'admin' || password === 'admin123' || password === '123456');

    if (isValidNew || isValidLegacy) {
      return res.json({
        success: true,
        token: 'admin-session-token-' + Date.now(),
        user: { 
          username: username || 'msharifulvisionary@gmail.com', 
          role: 'administrator', 
          name: 'এডমিন ম্যানেজিং ডিরেক্টর' 
        }
      });
    }
    return res.status(401).json({
      success: false,
      error: 'ভুল ইউজারনেম অথবা পাসওয়ার্ড! সঠিক তথ্য দিয়ে চেষ্টা করুন।'
    });
  });

  // System & Environment status
  app.get('/api/status', async (req, res) => {
    const supabaseConnected = await testSupabaseConnection();
    res.json({
      supabase_connected: supabaseConnected,
      telegram_configured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
      telegram_chat_id: process.env.TELEGRAM_CHAT_ID || 'Not set',
      supabase_url: process.env.SUPABASE_URL || 'Not set',
      node_env: process.env.NODE_ENV || 'development',
    });
  });

  // Core Scrape & Notify Endpoint (Invoked by Vercel Cron or Manual UI Trigger)
  const handleScrapeAndNotify = async (req: express.Request, res: express.Response) => {
    try {
      const customBotToken = req.body?.botToken || req.query?.botToken as string;
      const customChatId = req.body?.chatId || req.query?.chatId as string;

      const result = await runScrapeAndNotify({
        botToken: customBotToken,
        chatId: customChatId,
      });

      res.json({
        success: true,
        message: 'Scrape and notification process completed successfully.',
        data: result,
      });
    } catch (err: any) {
      console.error('[API /api/scrape-and-notify Error]:', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Error executing scrape and notify task',
      });
    }
  };

  app.get('/api/scrape-and-notify', handleScrapeAndNotify);
  app.post('/api/scrape-and-notify', handleScrapeAndNotify);

  // College Management APIs
  app.get('/api/colleges', async (req, res) => {
    try {
      const colleges = await dbGetColleges();
      res.json({ success: true, colleges });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/colleges', async (req, res) => {
    try {
      const { name, notice_url, selector_config, is_active } = req.body;
      if (!name || !notice_url) {
        return res.status(400).json({ success: false, error: 'College name and notice_url are required' });
      }

      const college = await dbAddCollege({
        name,
        notice_url,
        selector_config: selector_config || {
          row_selector: 'table tbody tr',
          date_selector: 'td:nth-child(2)',
          title_selector: 'td:nth-child(3)',
          link_selector: 'td:nth-child(4) a'
        },
        is_active: is_active !== false,
      });

      res.status(201).json({ success: true, college });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.put('/api/colleges/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      await dbUpdateCollege(id, updates);
      res.json({ success: true, message: 'College updated successfully' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/colleges/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await dbDeleteCollege(id);
      res.json({ success: true, message: 'College deleted successfully' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Recent Notices Endpoint
  app.get('/api/notices', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const notices = await dbGetRecentNotices(limit);
      res.json({ success: true, notices });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Live Scrape Tester (Dry Run) Endpoint
  app.post('/api/scrape-college', async (req, res) => {
    try {
      const { notice_url, selector_config } = req.body;
      if (!notice_url) {
        return res.status(400).json({ success: false, error: 'notice_url is required' });
      }

      const result = await scrapeCollegeNotices(
        notice_url,
        selector_config || {
          row_selector: 'table tbody tr',
          date_selector: 'td:nth-child(2)',
          title_selector: 'td:nth-child(3)',
          link_selector: 'td:nth-child(4) a'
        }
      );

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Test Telegram Bot Message Endpoint
  app.post('/api/test-telegram', async (req, res) => {
    try {
      const { botToken, chatId, customMessage } = req.body;
      const message = customMessage || '🧪 **Multi-College Notice Tracker**\n\nটেলিগ্রাম বট কানেকশন সফলভাবে সম্পন্ন হয়েছে! নোটিশ এলার্ট সার্ভিস চালু আছে।';

      const result = await sendTelegramMessage(message, { botToken, chatId });
      if (result.success) {
        res.json({ success: true, message: 'Telegram test message sent successfully!' });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ==========================================
  // Vite Integration for Front-End serving
  // ==========================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Multi-College Notice Tracker running at http://localhost:${PORT}`);
  });
}

startServer();
