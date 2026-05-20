/**
 * 图片用量统计 API 路由
 */

import { Router, RequestHandler } from 'express';
import { getErrorMessage } from '../../shared/utils/error-handler';

export function createImageUsageRouter(): Router {
  const router = Router();

  /**
   * GET /api/image-usage?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
   * 查询指定日期范围的图片用量
   */
  const getImageUsage: RequestHandler = async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) {
        res.status(400).json({ success: false, error: 'startDate 和 endDate 参数必填', records: [] });
        return;
      }

      const { getImageUsage: queryImageUsage } = await import('../../main/database/image-usage');
      const { SystemConfigStore } = await import('../../main/database/system-config-store');
      const db = SystemConfigStore.getInstance().getDb();
      const records = queryImageUsage(db, startDate as string, endDate as string);
      res.json({ success: true, records });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error), records: [] });
    }
  };

  router.get('/', getImageUsage);

  return router;
}
