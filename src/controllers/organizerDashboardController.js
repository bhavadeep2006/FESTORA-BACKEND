const { pool } = require('../config/db');

// Helper for event ownership check
const checkEventOwner = async (eventId, organizerId) => {
  const [rows] = await pool.query('SELECT * FROM events WHERE id = ?', [eventId]);
  if (rows.length === 0) {
    return { exists: false, isOwner: false };
  }
  const event = rows[0];
  return { exists: true, isOwner: event.organizer_id === organizerId, event };
};

// GET /api/organizer/dashboard - High level summary stats for logged-in organizer
const getOrganizerDashboardSummary = async (req, res) => {
  try {
    const organizerId = req.organizer.id;

    // 1. Total events breakdown
    const [eventCounts] = await pool.query(
      `SELECT 
        COUNT(*) as total_events,
        SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) as published_events,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft_events,
        SUM(CASE WHEN event_date >= CURDATE() THEN 1 ELSE 0 END) as upcoming_events
       FROM events 
       WHERE organizer_id = ?`,
      [organizerId]
    );

    const counts = eventCounts[0];

    // 2. Total registrations across organizer's events
    const [regCounts] = await pool.query(
      `SELECT COUNT(*) as total_registrations
       FROM registrations r
       JOIN events e ON r.event_id = e.id
       WHERE e.organizer_id = ? AND r.registration_status IN ('confirmed', 'pending')`,
      [organizerId]
    );

    // 3. Total check-ins across organizer's events
    const [checkinCounts] = await pool.query(
      `SELECT COUNT(*) as total_checked_in
       FROM checkins c
       JOIN events e ON c.event_id = e.id
       WHERE e.organizer_id = ? AND c.status = 'success'`,
      [organizerId]
    );

    return res.status(200).json({
      total_events: Number(counts.total_events || 0),
      published_events: Number(counts.published_events || 0),
      draft_events: Number(counts.draft_events || 0),
      upcoming_events: Number(counts.upcoming_events || 0),
      total_registrations: Number(regCounts[0].total_registrations || 0),
      total_checked_in: Number(checkinCounts[0].total_checked_in || 0)
    });
  } catch (error) {
    console.error('Error fetching organizer dashboard summary:', error);
    return res.status(500).json({
      message: 'Server error while fetching dashboard summary.'
    });
  }
};

// GET /api/organizer/events/:eventId/dashboard - Detailed dashboard for a specific event
const getEventDashboardStats = async (req, res) => {
  try {
    const organizerId = req.organizer.id;
    const { eventId } = req.params;

    const ownership = await checkEventOwner(eventId, organizerId);
    if (!ownership.exists) {
      return res.status(404).json({ message: 'Event not found.' });
    }
    if (!ownership.isOwner) {
      return res.status(403).json({ message: 'Access forbidden. You do not own this event.' });
    }

    const event = ownership.event;

    // Registrations Breakdown
    const [regBreakdown] = await pool.query(
      `SELECT 
        COUNT(*) as total_registrations,
        SUM(CASE WHEN registration_status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
        SUM(CASE WHEN registration_status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN registration_status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
       FROM registrations
       WHERE event_id = ?`,
      [eventId]
    );

    const breakdown = regBreakdown[0];

    // Checkins count
    const [checkinRows] = await pool.query(
      `SELECT COUNT(*) as count FROM checkins WHERE event_id = ? AND status = 'success'`,
      [eventId]
    );

    const totalRegs = Number(breakdown.total_registrations || 0);
    const confirmedCount = Number(breakdown.confirmed || 0);
    const pendingCount = Number(breakdown.pending || 0);
    const cancelledCount = Number(breakdown.cancelled || 0);
    const checkedInCount = Number(checkinRows[0].count || 0);

    const validRegistrations = confirmedCount + pendingCount;
    const remainingCount = Math.max(0, validRegistrations - checkedInCount);

    const attendancePercentage = validRegistrations > 0
      ? Number(((checkedInCount / validRegistrations) * 100).toFixed(2))
      : 0;

    return res.status(200).json({
      event: {
        id: event.id,
        title: event.title,
        status: event.status,
        event_date: event.event_date,
        venue: event.venue,
        registration_fee: event.registration_fee
      },
      statistics: {
        total_registrations: totalRegs,
        confirmed: confirmedCount,
        pending: pendingCount,
        cancelled: cancelledCount,
        checked_in: checkedInCount,
        remaining: remainingCount,
        capacity: event.max_participants,
        attendance_percentage: attendancePercentage
      }
    });

  } catch (error) {
    console.error('Error fetching event dashboard stats:', error);
    return res.status(500).json({
      message: 'Server error while fetching event statistics.'
    });
  }
};

// GET /api/organizer/events/:eventId/export - Export event participants to CSV
const exportEventParticipantsCSV = async (req, res) => {
  try {
    const organizerId = req.organizer.id;
    const { eventId } = req.params;

    const ownership = await checkEventOwner(eventId, organizerId);
    if (!ownership.exists) {
      return res.status(404).json({ message: 'Event not found.' });
    }
    if (!ownership.isOwner) {
      return res.status(403).json({ message: 'Access forbidden. You do not own this event.' });
    }

    const [rows] = await pool.query(
      `SELECT u.full_name, u.email, u.phone, u.college, u.department, u.year_of_study,
              r.registration_status, r.registered_at,
              t.ticket_code, t.ticket_status,
              c.scanned_at as checked_in_at
       FROM registrations r
       JOIN users u ON r.user_id = u.id
       LEFT JOIN tickets t ON t.registration_id = r.id
       LEFT JOIN checkins c ON c.ticket_id = t.id
       WHERE r.event_id = ?
       ORDER BY r.registered_at DESC`,
      [eventId]
    );

    // CSV Header Columns
    const csvHeaders = [
      'Name',
      'Email',
      'Phone',
      'College',
      'Department',
      'Year',
      'Registration Status',
      'Ticket Code',
      'Ticket Status',
      'Check-in Status',
      'Checked-in At',
      'Registered At'
    ];

    const formatCSVField = (field) => {
      if (field === null || field === undefined) return '""';
      const str = String(field).replace(/"/g, '""');
      return `"${str}"`;
    };

    const csvRows = rows.map(row => {
      const checkinStatus = row.checked_in_at ? 'Checked In' : 'Not Checked In';
      return [
        formatCSVField(row.full_name),
        formatCSVField(row.email),
        formatCSVField(row.phone),
        formatCSVField(row.college),
        formatCSVField(row.department),
        formatCSVField(row.year_of_study),
        formatCSVField(row.registration_status),
        formatCSVField(row.ticket_code || 'N/A'),
        formatCSVField(row.ticket_status || 'N/A'),
        formatCSVField(checkinStatus),
        formatCSVField(row.checked_in_at ? new Date(row.checked_in_at).toISOString() : 'N/A'),
        formatCSVField(new Date(row.registered_at).toISOString())
      ].join(',');
    });

    const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');

    const fileName = `event_${eventId}_participants_${Date.now()}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    return res.status(200).send(csvContent);

  } catch (error) {
    console.error('Error exporting event participants CSV:', error);
    return res.status(500).json({
      message: 'Server error while exporting participant data.'
    });
  }
};

// GET /api/organizer/events/:eventId/registrations - View registered students for an event
const getEventRegistrations = async (req, res) => {
  try {
    const organizerId = req.organizer.id;
    const { eventId } = req.params;

    const ownership = await checkEventOwner(eventId, organizerId);
    if (!ownership.exists) {
      return res.status(404).json({ message: 'Event not found.' });
    }
    if (!ownership.isOwner) {
      return res.status(403).json({ message: 'Access forbidden. You do not own this event.' });
    }

    const [rows] = await pool.query(
      `SELECT u.full_name as student_name, u.email as student_email, u.phone as student_phone,
              u.college, u.department, u.year_of_study,
              r.id as registration_id, r.registration_status, r.registered_at,
              e.registration_type,
              t.ticket_code, t.ticket_status
       FROM registrations r
       JOIN users u ON r.user_id = u.id
       JOIN events e ON r.event_id = e.id
       LEFT JOIN tickets t ON t.registration_id = r.id
       WHERE r.event_id = ?
       ORDER BY r.registered_at DESC`,
      [eventId]
    );

    // Attach Team details and Custom Field answers
    for (const reg of rows) {
      if (reg.registration_type === 'team') {
        const [teams] = await pool.query(
          'SELECT * FROM registration_teams WHERE registration_id = ?',
          [reg.registration_id]
        );
        if (teams.length > 0) {
          reg.team_name = teams[0].team_name;
          const [members] = await pool.query(
            'SELECT * FROM registration_team_members WHERE team_id = ? ORDER BY is_team_leader DESC, id ASC',
            [teams[0].id]
          );
          reg.team_members = members;
        } else {
          reg.team_name = null;
          reg.team_members = [];
        }
      } else {
        reg.team_name = null;
        reg.team_members = [];
      }

      // Fetch custom field values
      const [vals] = await pool.query(
        `SELECT rfv.value, erf.field_label, erf.field_type
         FROM registration_field_values rfv
         JOIN event_registration_fields erf ON rfv.field_id = erf.id
         WHERE rfv.registration_id = ?`,
        [reg.registration_id]
      );
      reg.custom_fields_data = vals;
    }

    return res.status(200).json({
      count: rows.length,
      registrations: rows
    });
  } catch (error) {
    console.error('Error fetching event registrations for organizer:', error);
    return res.status(500).json({
      message: 'Server error while fetching event registrations.'
    });
  }
};

// GET /api/organizer/registrations - View all registrations across events owned by logged-in organizer
const getAllOrganizerRegistrations = async (req, res) => {
  try {
    const organizerId = req.organizer.id;

    const [rows] = await pool.query(
      `SELECT u.full_name as student_name, u.email as student_email, u.phone as student_phone,
              u.college, u.department, u.year_of_study,
              r.id as registration_id, r.registration_status, r.registered_at,
              e.id as event_id, e.title as event_title, e.registration_type,
              t.ticket_code, t.ticket_status
       FROM registrations r
       JOIN users u ON r.user_id = u.id
       JOIN events e ON r.event_id = e.id
       LEFT JOIN tickets t ON t.registration_id = r.id
       WHERE e.organizer_id = ?
       ORDER BY r.registered_at DESC`,
      [organizerId]
    );

    // Attach Team details and Custom Field answers
    for (const reg of rows) {
      if (reg.registration_type === 'team') {
        const [teams] = await pool.query(
          'SELECT * FROM registration_teams WHERE registration_id = ?',
          [reg.registration_id]
        );
        if (teams.length > 0) {
          reg.team_name = teams[0].team_name;
          const [members] = await pool.query(
            'SELECT * FROM registration_team_members WHERE team_id = ? ORDER BY is_team_leader DESC, id ASC',
            [teams[0].id]
          );
          reg.team_members = members;
        } else {
          reg.team_name = null;
          reg.team_members = [];
        }
      } else {
        reg.team_name = null;
        reg.team_members = [];
      }

      // Fetch custom field values
      const [vals] = await pool.query(
        `SELECT rfv.value, erf.field_label, erf.field_type
         FROM registration_field_values rfv
         JOIN event_registration_fields erf ON rfv.field_id = erf.id
         WHERE rfv.registration_id = ?`,
        [reg.registration_id]
      );
      reg.custom_fields_data = vals;
    }

    return res.status(200).json({
      count: rows.length,
      registrations: rows
    });
  } catch (error) {
    console.error('Error fetching all registrations for organizer:', error);
    return res.status(500).json({
      message: 'Server error while fetching registrations.'
    });
  }
};

module.exports = {
  getOrganizerDashboardSummary,
  getEventDashboardStats,
  exportEventParticipantsCSV,
  getEventRegistrations,
  getAllOrganizerRegistrations
};
