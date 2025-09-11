const express = require("express");
const bodyParser = require("body-parser");
const QRCode = require("qrcode");
const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 5000;
const DATA_FILE = path.join(__dirname, "registrations.json");

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "../frontend")));

const readData = () => {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            fs.writeFileSync(DATA_FILE, "[]");
        }
        const data = fs.readFileSync(DATA_FILE);
        return JSON.parse(data);
    } catch (error) {
        console.error("Error reading data file:", error);
        return [];
    }
};

const writeData = (data) => {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("Error writing data file:", error);
    }
};

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "../frontend/index.html")));
app.get("/success", (req, res) => res.sendFile(path.join(__dirname, "../frontend/success.html")));
app.get("/scanner", (req, res) => res.sendFile(path.join(__dirname, "../frontend/scanner.html")));
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "../frontend/admin.html")));

app.post("/register", async (req, res) => {
    const { name, email, roll } = req.body;
    const registrations = readData();

    if (!name || !email || !roll) {
        return res.status(400).json({ success: false, message: "All fields are required!" });
    }
    
    const isDuplicate = registrations.some(reg => reg.email === email || reg.roll === roll);
    if (isDuplicate) {
        return res.status(409).json({ success: false, message: "This email or roll number is already registered." });
    }

    try {
        const lastID = registrations.length > 0 ? Math.max(...registrations.map(reg => reg.id)) + 1 : 1;
        
        const qrDataPayload = JSON.stringify({
            id: lastID,
            name: name,
            email: email,
            roll: roll
        });

        const qrCodeDataUrl = await QRCode.toDataURL(qrDataPayload);

        const newRegistration = {
            id: lastID,
            name: name,
            email: email,
            roll: roll,
            attended: 0,
        };
        
        registrations.push(newRegistration);
        writeData(registrations);

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
        res.status(500).json({ success: false, message: "Server error during registration." });
    }
});

app.post("/attendance", (req, res) => {
    const { qrData } = req.body;
    const registrations = readData();
    
    if (!qrData) {
        return res.status(400).json({ success: false, message: "QR data required" });
    }

    try {
        const scannedData = JSON.parse(qrData);
        const userId = scannedData.id;

        const registration = registrations.find(reg => reg.id.toString() === userId.toString());
        
        if (!registration) {
            return res.status(404).json({ success: false, message: "Invalid QR code." });
        }
        if (registration.attended === 1) {
            return res.json({ success: false, message: "Attendance already marked for this QR." });
        }

        registration.attended = 1;
        writeData(registrations);

        res.json({ success: true, message: "Attendance marked ✅" });
    } catch (err) {
        console.error("Attendance marking error:", err);
        res.status(500).json({ success: false, message: "Database error." });
    }
});

app.get("/admin/data", (req, res) => {
    const registrations = readData();
    res.json({ success: true, data: registrations });
});

app.get("/attendance-status", (req, res) => {
    const registrations = readData();
    const totalRegistrations = registrations.length;
    const totalAttendees = registrations.filter(reg => reg.attended === 1).length;
    
    res.json({
        success: true,
        totalRegistrations: totalRegistrations,
        totalAttendees: totalAttendees
    });
});

app.get("/user-details-by-id/:id", (req, res) => {
    const userId = req.params.id;
    const registrations = readData();
    const user = registrations.find(reg => reg.id.toString() === userId);
    
    if (!user) {
        return res.status(404).json({ success: false, message: "User not found." });
    }
    
    res.json({ success: true, user: user });
});

app.get("/export", (req, res) => {
    const rows = readData();
    
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
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});