import mongoose from "mongoose";
import crypto from "crypto";

// A LocationShare is intentionally its own lightweight collection, not a
// field on the User document. The public tracking page needs to read this
// with NO authentication (a contact clicking a link, no account), so it must
// never expose anything beyond what's needed to show a dot on a map -
// no email, no other contacts, no account details. Keeping it separate
// keeps that boundary impossible to accidentally leak through.
const LocationShareSchema = new mongoose.Schema(
  {
    shareId: {
      type: String,
      required: true,
      unique: true,
      default: () => crypto.randomBytes(12).toString("hex"),
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    senderName: {
      type: String,
      default: "Someone",
    },
    // 'once' = single snapshot, no further updates expected.
    // '15min' / '30min' = live, auto-expires.
    // 'untilOff' = live, no time limit, only stops when explicitly stopped.
    mode: {
      type: String,
      enum: ["once", "15min", "30min", "untilOff"],
      required: true,
    },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    accuracy: { type: Number },
    active: {
      type: Boolean,
      default: true,
    },
    // null for 'once' and 'untilOff' - both rely on `active` instead of time.
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.model("LocationShare", LocationShareSchema);
