const multer = require("multer");
const fs = require("fs");
const path = require("path");

const express = require('express');
const app = express();
const router = express.Router();
const requireLogin = require('../modules/authenticate');
const programController = require('../controllers/programController');

// Set up storage
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, "uploads/"); 
    },
    filename: function(req, file, cb) {
        const originalName = file.originalname;
        const ext = path.extname(originalName);
        const baseName = path.basename(originalName, ext);

        const safeName = baseName.replace(/\s+/g, "-").toLowerCase();

        cb(null, `${safeName}-${Date.now()}${ext}`);
    }
});
const upload = multer({ storage: storage });

router.post("/upload-program-image", upload.single("programImage"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    // Return the uploaded image URL
    res.json({ imageUrl: `/uploads/${req.file.filename}` });
});

router.post("/delete-program-image", (req, res) => {
    const imageUrl = req.body.imageUrl; 
    if (!imageUrl) return res.status(400).send("No image URL provided");

    const filePath = path.join(__dirname, "..", imageUrl);
    fs.unlink(filePath, (err) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Failed to delete file");
        }
        res.send({ message: "Deleted successfully" });
    });
});

router.get("/programs", requireLogin, programController.programs);
router.post("/programs", requireLogin, programController.createProgram);
router.get("/getEditProgramModal/:id", requireLogin, programController.editProgramModal);
// router.get("/programs/new", requireLogin, programController.newProgramForm);
// router.get("/programs/:id/edit", requireLogin, programController.editProgramForm);
// router.post("/programs/:id/edit", requireLogin, programController.updateProgram);
router.post("/programs/:id/delete", requireLogin, programController.deleteProgram);

module.exports = router;