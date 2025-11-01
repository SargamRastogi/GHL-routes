import express from "express";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json());

// keys in .env file
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GHL_API_KEY = process.env.GHL_API_KEY;
const GHL_CALENDAR_ID = process.env.GHL_CALENDAR_ID;


app.get("/", (req, res) => {
  res.send("GHL Smart Appointment Route is running successfully!");
});

/**
 * POST /check-available-slots
 * Request Body:
 * {
 *   "customerAddress": "123 Main St, Buffalo, NY",
 *   "staffAddress": "9990 Transit Rd, Buffalo, NY",
 *   "requestedDate": "2025-11-01",
 *   "requestedTime": "10:30 AM"
 * }
 */
app.post("/check-available-slots", async (req, res) => {
  try {
    const { customerAddress, staffAddress, requestedDate, requestedTime } = req.body;

    if (!customerAddress || !staffAddress || !requestedDate || !requestedTime) {
      return res.status(400).json({ error: "Missing required fields" });
    }

 
    const ghlRes = await axios.get(
      "https://services.leadconnectorhq.com/appointments/",
      {
        headers: {
          Authorization: `Bearer ${GHL_API_KEY}`,
          Version: "2021-07-28",
          Accept: "application/json",
        },
        params: {
          calendarId: GHL_CALENDAR_ID,
          status: "booked",
          limit: 1,
          sort: "desc",
        },
      }
    );

    const lastAppt = ghlRes.data.appointments?.[0];

   
    const prevAddress = lastAppt?.location || staffAddress;
    const prevEnd = lastAppt ? new Date(lastAppt.endTime) : null;

   
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(
      prevAddress
    )}&destinations=${encodeURIComponent(customerAddress)}&key=${GOOGLE_API_KEY}`;

    const distanceRes = await axios.get(url);
    const element = distanceRes.data.rows[0].elements[0];

    if (!element || element.status !== "OK") {
      throw new Error("Could not calculate distance between the given addresses");
    }

    const distance = element.distance.text;
    const duration = element.duration.text;
    const durationValue = element.duration.value / 60; // minutes

   
    const bufferTime = 15;
    const totalTravelTime = durationValue + bufferTime;

   
    const requestedDateTime = new Date(`${requestedDate} ${requestedTime}`);
    let available = true;
    let nextAvailableSlot = null;

    if (prevEnd) {
      const nextPossibleStart = new Date(prevEnd.getTime() + totalTravelTime * 60000);
      if (requestedDateTime < nextPossibleStart) {
        available = false;
        nextAvailableSlot = nextPossibleStart.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        });
      }
    }

 
    const slotStart = available
      ? requestedDateTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
      : nextAvailableSlot;
    const slotEnd = new Date(
      new Date(requestedDateTime).getTime() + 30 * 60000
    ).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

   
    return res.json({
      success: true,
      available,
      distance,
      travelDuration: duration,
      totalTravelTime: `${Math.round(totalTravelTime)} minutes`,
      previousLocation: prevAddress,
      previousAppointmentEnd: prevEnd,
      suggestedSlot: `${slotStart} - ${slotEnd}`,
      message: available
        ? "Slot available for booking"
        : `⏱ Not enough time after last appointment. Next available at ${slotStart}`,
    });
  } catch (error) {
    console.error("Error:", error.message);
    return res.status(500).json({ error: error.message });
  }
});

//  For Render or local testing
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));