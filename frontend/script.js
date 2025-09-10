// Function to handle fetching and displaying data for all parts of the application
async function fetchData(url, options = {}) {
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(errorData.message || "Something went wrong.");
        }
        return await response.json();
    } catch (err) {
        console.error("Fetch error:", err);
        throw err;
    }
}

// ===== Registration =====
const registerForm = document.getElementById("registerForm");
if (registerForm) {
    registerForm.addEventListener("submit", async e => {
        e.preventDefault();
        const name = document.getElementById("name").value;
        const email = document.getElementById("email").value;
        const roll = document.getElementById("roll").value;
        const messageEl = document.getElementById("message");

        messageEl.textContent = "";

        try {
            const data = await fetchData("/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, roll })
            });

            if (data.success) {
                // Store registration data and QR code in localStorage for the success page
                localStorage.setItem("registrationData", JSON.stringify(data.userData));
                localStorage.setItem("qrCode", data.qrCode);
                window.location.href = "success.html";
            } else {
                messageEl.textContent = data.message;
            }
        } catch (err) {
            messageEl.textContent = err.message || "Server error!";
        }
    });
}

// ===== Scanner =====
const startScanBtn = document.getElementById("start-scan-btn");
if (startScanBtn) {
    const qrScanner = new Html5Qrcode("reader");
    const messageEl = document.getElementById("message");

    function onScanSuccess(decodedText, decodedResult) {
        qrScanner.stop().then(() => {
            console.log(`QR code scanned: ${decodedText}`);
            markAttendance(decodedText);
        }).catch(err => {
            console.error(`Failed to stop scanning: ${err}`);
        });
    }

    function onScanError(errorMessage) {
        // Log errors to the console but don't show to the user
        // console.log(`QR scan error: ${errorMessage}`);
    }

    startScanBtn.addEventListener("click", () => {
        const config = { fps: 10, qrbox: { width: 250, height: 250 } };
        qrScanner.start({ facingMode: "environment" }, config, onScanSuccess, onScanError)
            .then(() => {
                messageEl.textContent = "Scanning...";
                messageEl.style.color = "var(--light-text-color)";
                startScanBtn.style.display = "none";
            })
            .catch(err => {
                messageEl.textContent = `Error: Camera access denied or not found.`;
                messageEl.style.color = "var(--error-color)";
                console.error(`Unable to start scanning: ${err}`);
            });
    });

    // Function to send data to the backend
    async function markAttendance(qrData) {
        try {
            const res = await fetch("/attendance", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ qrData })
            });
            const data = await res.json();
            
            messageEl.textContent = data.message;
            messageEl.style.color = data.success ? "var(--success-color)" : "var(--error-color)";
            
            setTimeout(() => {
                startScanBtn.style.display = "block";
            }, 2000);
        } catch (err) {
            messageEl.textContent = "Server error!";
            messageEl.style.color = "var(--error-color)";
            console.error(err);
            startScanBtn.style.display = "block";
        }
    }
}

// ===== Admin Dashboard =====
const adminTable = document.getElementById("adminTable");
const downloadBtn = document.getElementById("downloadBtn");
const totalRegistrantsEl = document.getElementById("totalRegistrants");
const totalAttendeesEl = document.getElementById("totalAttendees");
const attendanceRateEl = document.getElementById("attendanceRate");
const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");

let allAttendeesData = []; // Store the full dataset

if (adminTable) {
    // Function to render the table rows based on filtered data
    function renderAttendees(data) {
        const tbody = adminTable.querySelector("tbody");
        tbody.innerHTML = '';
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5">No attendees found.</td></tr>';
            return;
        }

        data.forEach(attendee => {
            let status = 'Registered';
            let statusClass = 'registered';
            
            if (attendee.attended === 1) {
                status = 'Attended';
                statusClass = 'attended';
            }
            
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${attendee.id}</td>
                <td>${attendee.name}</td>
                <td>${attendee.email}</td>
                <td>${attendee.roll}</td>
                <td><span class="status-badge ${statusClass}">${status}</span></td>
            `;
            tbody.appendChild(tr);
        });
    }

    // Function to load all data from the server
    async function loadAdminData() {
        try {
            const data = await fetchData("/admin/data");
            if (data.success && data.data) {
                allAttendeesData = data.data; // Store the data
                filterAndSearch(); // Call the filter function to render the initial table
            }
        } catch (err) {
            adminTable.querySelector("tbody").innerHTML = '<tr><td colspan="5">Failed to load data. Please try again.</td></tr>';
        }
    }

    // Function to update the live attendance stats
    async function updateAttendanceStats() {
        try {
            const data = await fetchData("/attendance-status");
            if (data.success) {
                totalRegistrantsEl.textContent = data.totalRegistrations;
                totalAttendeesEl.textContent = data.totalAttendees;

                const rate = data.totalRegistrations > 0 
                    ? ((data.totalAttendees / data.totalRegistrations) * 100).toFixed(1)
                    : 0;
                attendanceRateEl.textContent = `${rate}%`;
            }
        } catch (err) {
            // Optional: display an error message on the dashboard
        }
    }

    // Search and Filter logic
    function filterAndSearch() {
        const searchTerm = searchInput.value.toLowerCase();
        const filterStatus = statusFilter.value;

        const filteredData = allAttendeesData.filter(attendee => {
            const nameMatch = attendee.name.toLowerCase().includes(searchTerm);
            const emailMatch = attendee.email.toLowerCase().includes(searchTerm);
            const rollMatch = attendee.roll.toLowerCase().includes(searchTerm);
            
            let statusMatch = true;
            if (filterStatus === 'attended') {
                statusMatch = attendee.attended === 1;
            } else if (filterStatus === 'registered') {
                statusMatch = attendee.attended === 0;
            }

            return (nameMatch || emailMatch || rollMatch) && statusMatch;
        });

        renderAttendees(filteredData);
    }
    
    // Event listeners for search and filter controls
    searchInput.addEventListener('input', filterAndSearch);
    statusFilter.addEventListener('change', filterAndSearch);

    // Initial data load and periodic updates
    loadAdminData();
    updateAttendanceStats();
    setInterval(updateAttendanceStats, 5000);

    // Download button functionality
    downloadBtn.addEventListener("click", () => {
        window.location.href = "/export";
    });
}