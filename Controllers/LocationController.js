import LocationShare from "../Models/LocationShareModel.js";

const DURATION_MS = {
  "15min": 15 * 60 * 1000,
  "30min": 30 * 60 * 1000,
};

// Starts a new share session (or a single one-time snapshot) and returns
// a shareId the frontend turns into a public link: /track/:shareId
const StartLocationShare = async (req, res) => {
  try {
    const { userId, senderName, mode, latitude, longitude, accuracy } = req.body;

    if (!userId || !mode || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ message: "userId, mode, latitude and longitude are required" });
    }
    if (!["once", "15min", "30min", "untilOff"].includes(mode)) {
      return res.status(400).json({ message: "Invalid mode" });
    }

    const expiresAt = DURATION_MS[mode] ? new Date(Date.now() + DURATION_MS[mode]) : null;

    // 'once' is a single snapshot - there will never be a follow-up update,
    // so mark it inactive immediately rather than leaving it looking "live"
    // forever with a position that will only ever go stale.
    const share = await LocationShare.create({
      user: userId,
      senderName: senderName || "Someone",
      mode,
      latitude,
      longitude,
      accuracy,
      active: mode !== "once",
      expiresAt,
    });

    res.status(201).json({ shareId: share.shareId, mode: share.mode, expiresAt: share.expiresAt });
  } catch (error) {
    console.error("StartLocationShare error:", error);
    res.status(500).json({ message: "Could not start location sharing" });
  }
};

// Called periodically by the sharer's browser while a live share (15min /
// 30min / untilOff) is active, to push a fresh position.
const UpdateLocationShare = async (req, res) => {
  try {
    const { shareId, latitude, longitude, accuracy } = req.body;
    if (!shareId || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ message: "shareId, latitude and longitude are required" });
    }

    const share = await LocationShare.findOne({ shareId });
    if (!share) {
      return res.status(404).json({ message: "Share not found" });
    }
    if (!share.active) {
      return res.status(410).json({ message: "This share has ended" });
    }
    if (share.expiresAt && share.expiresAt.getTime() < Date.now()) {
      share.active = false;
      await share.save();
      return res.status(410).json({ message: "This share has expired" });
    }

    share.latitude = latitude;
    share.longitude = longitude;
    if (accuracy !== undefined) share.accuracy = accuracy;
    await share.save();

    res.status(200).json({ message: "Updated" });
  } catch (error) {
    console.error("UpdateLocationShare error:", error);
    res.status(500).json({ message: "Could not update location" });
  }
};

// Sharer explicitly turns off an "untilOff" (or any) share early.
const StopLocationShare = async (req, res) => {
  try {
    const { shareId } = req.body;
    if (!shareId) {
      return res.status(400).json({ message: "shareId is required" });
    }
    const share = await LocationShare.findOneAndUpdate({ shareId }, { active: false }, { new: true });
    if (!share) {
      return res.status(404).json({ message: "Share not found" });
    }
    res.status(200).json({ message: "Stopped" });
  } catch (error) {
    console.error("StopLocationShare error:", error);
    res.status(500).json({ message: "Could not stop sharing" });
  }
};

// Public, no-auth endpoint - this is what the /track/:shareId page polls.
// Only ever returns the minimum needed to draw a dot on a map: never the
// sender's email, contacts, or any other account data.
const GetLocationShare = async (req, res) => {
  try {
    const { shareId } = req.params;
    const share = await LocationShare.findOne({ shareId });
    if (!share) {
      return res.status(404).json({ message: "This link is invalid or has expired" });
    }

    const isExpired = share.expiresAt && share.expiresAt.getTime() < Date.now();
    if (isExpired && share.active) {
      share.active = false;
      await share.save();
    }

    res.status(200).json({
      senderName: share.senderName,
      mode: share.mode,
      latitude: share.latitude,
      longitude: share.longitude,
      accuracy: share.accuracy,
      active: share.active && !isExpired,
      expiresAt: share.expiresAt,
      updatedAt: share.updatedAt,
    });
  } catch (error) {
    console.error("GetLocationShare error:", error);
    res.status(500).json({ message: "Could not load this share" });
  }
};

export { StartLocationShare, UpdateLocationShare, StopLocationShare, GetLocationShare };
