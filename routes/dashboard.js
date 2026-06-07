import express from 'express';
import { protect } from '../middleware/auth.js';
import { getDashboardSummary } from '../services/dashboardService.js';
import { sendServerError } from '../utils/apiResponse.js';

const router = express.Router();
router.use(protect);

router.get('/', async (req, res) => {
  try {
    const summary = await getDashboardSummary(req.user._id);
    res.json(summary);
  } catch (err) {
    sendServerError(res, err);
  }
});

export default router;
