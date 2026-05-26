const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const requireLogin = require('../modules/authenticate');
const teamController = require('../controllers/teamController');

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
        const safeBase = String(path.basename(file.originalname || 'team-photo', ext))
            .toLowerCase()
            .replace(/[^a-z0-9-_]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '') || 'team-photo';
        cb(null, `${safeBase}-${Date.now()}${ext}`);
    },
});

const upload = multer({ storage });

router.get('/team', requireLogin, teamController.getTeam);
router.get('/team/:id', requireLogin, teamController.getMember);
router.post('/upload-team-image', requireLogin, upload.single('teamImage'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        return res.json({ imageUrl: `/uploads/${req.file.filename}`, publicId: '' });
    } catch (error) {
        console.error('Team image upload failed:', error);
        return res.status(500).json({ error: 'Failed to upload image' });
    }
});
router.post('/team', requireLogin, teamController.createMember);
router.put('/team/reorder', requireLogin, teamController.reorderMembers);
router.post('/team/reorder', requireLogin, teamController.reorderMembers);
router.put('/team/:id', requireLogin, teamController.updateMember);
router.delete('/team/:id', requireLogin, teamController.deleteMember);

module.exports = router;
