import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const { username, password } = req.body || {};
    const isValidNew = username === 'msharifulvisionary@gmail.com' && password === 'ahcphysics@adminlogin';
    const isValidLegacy =
      (username === 'admin' || username === 'admin@college.bd') &&
      (password === 'admin' || password === 'admin123' || password === '123456');

    if (isValidNew || isValidLegacy) {
      return res.status(200).json({
        success: true,
        token: 'admin-session-token-' + Date.now(),
        user: {
          username: username || 'msharifulvisionary@gmail.com',
          role: 'administrator',
          name: 'এডমিন ম্যানেজিং ডিরেক্টর',
        },
      });
    }

    return res.status(401).json({
      success: false,
      error: 'ভুল ইউজারনেম অথবা পাসওয়ার্ড! সঠিক তথ্য দিয়ে চেষ্টা করুন।',
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
