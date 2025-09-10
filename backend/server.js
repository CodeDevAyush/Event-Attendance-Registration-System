const express = require("express");
const bodyParser = require("body-parser");
const sqlite3 = require("sqlite3").verbose();
const QRCode = require("qrcode");
const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 5000; // Use the environment port or fallback to 5000

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "../frontend")));

// Database
const db = new sqlite3.Database("./database.sqlite", sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
        console.error("❌ DB error:", err.message);
    } else {
        console.log("✅ Connected to SQLite DB");
        db.run(`
            CREATE TABLE IF NOT EXISTS registrations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                email TEXT UNIQUE,
                roll TEXT UNIQUE,
                attended INTEGER DEFAULT 0
            )
        `, (createErr) => {
            if (createErr) console.error("❌ Table creation error:", createErr.message);
        });
    }
});

// Helper functions to promisify db calls
const dbRunAsync = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(query, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
};

const dbAllAsync = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const dbGetAsync = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

// ===== ROUTES =====

// Serve static pages
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "../frontend/index.html")));
app.get("/success", (req, res) => res.sendFile(path.join(__dirname, "../frontend/success.html")));
app.get("/scanner", (req, res) => res.sendFile(path.join(__dirname, "../frontend/scanner.html")));
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "../frontend/admin.html")));

// Handle registration form submission (API)
app.post("/register", async (req, res) => {
    const { name, email, roll } = req.body;

    if (!name || !email || !roll) {
        return res.status(400).json({ success: false, message: "All fields are required!" });
    }

    try {
        const result = await dbRunAsync("INSERT INTO registrations (name, email, roll) VALUES (?, ?, ?)", [name, email, roll]);
        const lastID = result.lastID;

        const qrCodeDataUrl = await QRCode.toDataURL(lastID.toString());

        res.status(201).json({
            success: true,
            message: "Registration successful!",
            qrCode: qrCodeDataUrl,
            userData: {
                name: name,
                email: email,
                roll: roll
            }
        });
    } catch (err) {
        console.error("Registration error:", err);
        let message = "Database error!";
        if (err.message.includes("UNIQUE constraint failed")) {
            message = "This email or roll number is already registered.";
        }
        res.status(500).json({ success: false, message: message });
    }
});

// Attendance marking (API)
app.post("/attendance", async (req, res) => {
    const { qrData } = req.body;
    if (!qrData) {
        return res.status(400).json({ success: false, message: "QR data required" });
    }

    try {
        const result = await dbRunAsync("UPDATE registrations SET attended = 1 WHERE id = ? AND attended = 0", [qrData]);
        if (result.changes === 0) {
            const user = await dbGetAsync("SELECT attended FROM registrations WHERE id = ?", [qrData]);
            if (user && user.attended === 1) {
                return res.json({ success: false, message: "Attendance already marked for this QR." });
            }
            return res.status(404).json({ success: false, message: "Invalid QR code or user not found." });
        }
        res.json({ success: true, message: "Attendance marked ✅" });
    } catch (err) {
        console.error("Attendance marking error:", err);
        res.status(500).json({ success: false, message: "Database error." });
    }
});

// Admin API to get all registration data
app.get("/admin/data", async (req, res) => {
    try {
        const rows = await dbAllAsync("SELECT id, name, email, roll, attended FROM registrations ORDER BY id DESC");
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error("Admin data retrieval error:", err);
        res.status(500).json({ success: false, message: "Failed to retrieve registration data." });
    }
});

// Admin API for live tracking stats
app.get("/attendance-status", async (req, res) => {
    try {
        const totalRegistrations = await dbGetAsync("SELECT COUNT(*) AS count FROM registrations");
        const totalAttendees = await dbGetAsync("SELECT COUNT(*) AS count FROM registrations WHERE attended = 1");
        res.json({
            success: true,
            totalRegistrations: totalRegistrations.count,
            totalAttendees: totalAttendees.count
        });
    } catch (err) {
        console.error("Attendance status retrieval error:", err);
        res.status(500).json({ success: false, message: "Failed to retrieve attendance status." });
    }
});

// Export attendance to Excel
app.get("/export", async (req, res) => {
    try {
        const rows = await dbAllAsync("SELECT name, email, roll, attended FROM registrations");

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, "Attendance");

        const filePath = path.join(__dirname, "attendance.xlsx");
        XLSX.writeFile(wb, filePath);
        
        res.download(filePath, "attendance.xlsx", (err) => {
            if (err) {
                console.error("File download error:", err);
                res.status(500).send("Error downloading the file.");
            }
            fs.unlink(filePath, (unlinkErr) => {
                if (unlinkErr) console.error("Error removing file:", unlinkErr);
            });
        });
    } catch (err) {
        console.error("Export error:", err);
        res.status(500).send("Error exporting data.");
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});