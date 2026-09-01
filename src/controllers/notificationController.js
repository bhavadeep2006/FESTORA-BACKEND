const { pool } = require('../config/db');

// GET /api/organizer/notifications - Fetch notifications for organizer
const getOrganizerNotifications = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50'
    );

    const unreadCount = rows.filter(n => !n.is_read).length;

    return res.status(200).json({
      count: rows.length,
      unreadCount,
      notifications: rows
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return res.status(500).json({
      message: 'Server error while fetching notifications.'
    });
  }
};

// PUT /api/organizer/notifications/:id/read - Mark single notification as read
const markNotificationRead = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query('SELECT * FROM notifications WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({
        message: 'Notification not found.'
      });
    }

    await pool.query('UPDATE notifications SET is_read = TRUE WHERE id = ?', [id]);

    return res.status(200).json({
      message: 'Notification marked as read.'
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return res.status(500).json({
      message: 'Server error while updating notification.'
    });
  }
};

// PUT /api/organizer/notifications/read-all - Mark all notifications as read
const markAllNotificationsRead = async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET is_read = TRUE WHERE is_read = FALSE');

    return res.status(200).json({
      message: 'All notifications marked as read.'
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    return res.status(500).json({
      message: 'Server error while updating notifications.'
    });
  }
};

module.exports = {
  getOrganizerNotifications,
  markNotificationRead,
  markAllNotificationsRead
};
