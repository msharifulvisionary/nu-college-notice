import type { VercelRequest, VercelResponse } from '@vercel/node';
import { dbUpdateCollege, dbDeleteCollege } from '../../src/lib/db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { id } = req.query;
  const collegeId = Array.isArray(id) ? id[0] : id;

  if (!collegeId) {
    return res.status(400).json({ success: false, error: 'College ID is required' });
  }

  if (req.method === 'PUT') {
    try {
      const updates = req.body || {};
      await dbUpdateCollege(collegeId, updates);
      return res.status(200).json({ success: true, message: 'College updated successfully' });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  if (req.method === 'DELETE') {
    try {
      await dbDeleteCollege(collegeId);
      return res.status(200).json({ success: true, message: 'College deleted successfully' });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ success: false, error: 'Method Not Allowed' });
}
