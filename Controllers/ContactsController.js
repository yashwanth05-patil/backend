import User from "../Models/UserModel.js";
import { cloudinaryUpload, cloudinaryUploadEvidence } from "../Utils/Cloudinary.js";
import fs from "fs";
import getPublicIdFromUrl from "../Utils/getPublicIdFromUrl.js";
import { v2 as cloudinary } from "cloudinary";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const AddContact = async (req, res) => {
  const { MobileNo, name, userId, email } = req.body;

  if (!MobileNo || !name || !userId) {
    return res.status(400).json({ message: "Please enter all the fields" });
  }

  let photo;

  try {
    if (req.file) {
      photo = await cloudinaryUpload(req.file.path);
      fs.unlink(req.file.path, (err) => {
        if (err) console.error("Error deleting local file:", err);
      });
    } else {
      photo = "https://via.placeholder.com/150";
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $push: {
          contacts: { user: userId, photo, name, MobileNo, email },
        },
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const newContact = updatedUser.contacts[updatedUser.contacts.length - 1];

    res.status(201).json({
      message: "Contact added successfully",
      contact: newContact,
    });
  } catch (error) {
    console.error("Error in AddContact:", error);
    res.status(500).json({ message: "An error occurred in Adding Contact" });
  }
};

const DeleteContact = async (req, res) => {
  const { userId, contactId } = req.query;

  if (!userId || !contactId) {
    return res.status(400).json({ message: "User ID and Contact ID are required" });
  }

  try {
    const user = await User.findById(userId);
    const ContactToDelete = user.contacts.find(
      (contact) => contact._id.toString() === contactId
    );

    if (!ContactToDelete) {
      return res.status(404).json({ message: "Contact not found" });
    }

    if (ContactToDelete.photo) {
      try {
        const publicId = getPublicIdFromUrl(ContactToDelete.photo);
        const status = await cloudinary.uploader.destroy(publicId);
        console.log("deleted Successfully", status);
      } catch (cloudinaryError) {
        console.error("Error deleting image from Cloudinary:", cloudinaryError);
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $pull: { contacts: { _id: contactId } } },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ message: "Contact deleted successfully", user: updatedUser });
  } catch (error) {
    console.error("Error deleting contact:", error);
    res.status(500).json({ message: "An error occurred while deleting the contact" });
  }
};

const SendEmergencyInfo = async (req, res) => {
  try {
    const { contacts, contactNumbers, location, senderName } = req.body;
    const displayName = senderName || "Someone";

    if (!location || !location.latitude || !location.longitude) {
      return res.status(400).json({ message: "Location is required" });
    }

    const mapsLink = `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`;
    const messageText = `EMERGENCY ALERT! Location: ${mapsLink} Please respond immediately.`;

    // SMS via Fast2SMS (disabled)
    const smsResults = [];

    // Email via Resend - uses batch sending with permissive validation so a
    // failure for one contact never prevents the others from being attempted.
    console.log("CONTACTS RECEIVED:", JSON.stringify(contacts, null, 2));
    const emailResults = [];
    if (contacts && contacts.length > 0) {
      const emailContacts = contacts.filter((contact) => {
        console.log(`Contact: ${contact.name}, Email: ${contact.email}`);
        return contact.email;
      });

      if (emailContacts.length > 0) {
        const emailPayload = emailContacts.map((contact) => ({
          from: "I'm Safe App <onboarding@resend.dev>",
          to: contact.email,
          subject: `Emergency - ${displayName} needs help right now`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background-color: #d32f2f; padding: 20px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 22px;">EMERGENCY</h1>
              </div>
              <div style="padding: 24px; background-color: #f9f9f9;">
                <p style="font-size: 18px; margin: 0 0 16px;">Hi ${contact.name},</p>
                <p style="font-size: 18px; font-weight: bold; margin: 0 0 16px;">This is ${displayName}. I'm in trouble. I need help. This is an emergency.</p>
                <p style="font-size: 16px; margin: 0 0 20px;">I triggered my SOS alert. This is my current location:</p>
                <div style="text-align: center; margin: 24px 0;">
                  <a href="${mapsLink}" style="background-color: #d32f2f; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold; display: inline-block;">
                    View My Location
                  </a>
                </div>
                <p style="font-size: 16px; font-weight: bold; color: #d32f2f;">Please call me or come find me right now.</p>
              </div>
              <div style="background-color: #333; padding: 10px; text-align: center;">
                <p style="color: #999; margin: 0; font-size: 12px;">Sent automatically via I'm Safe - Women Safety App</p>
              </div>
            </div>
          `,
        }));

        try {
          console.log('DEBUG location-mail using key prefix:', String(process.env.RESEND_API_KEY || '').slice(0, 8), 'length:', String(process.env.RESEND_API_KEY || '').length);

          const { data: batchData, error: batchError } = await resend.batch.send(
            emailPayload
          );

          // A resolved response can still carry a top-level error (e.g. an
          // auth failure). Treating it as success would hide the outage.
          if (batchError) {
            console.error('Emergency batch mail rejected:', batchError);
            emailResults.push(
              ...emailContacts.map((contact) => ({
                contact: contact.name,
                status: "failed",
                error: batchError.message || JSON.stringify(batchError),
              }))
            );
          } else {
            // In permissive mode the API returns one entry per recipient, so
            // we can accurately report which emails went out and which failed.
            (batchData?.data || []).forEach((item, index) => {
              const contact = emailContacts[index];
              if (!contact) return;
              if (item?.error) {
                console.error(`MAIL ERROR for ${contact.name}:`, item.error.message || item.error);
                emailResults.push({
                  contact: contact.name,
                  status: "failed",
                  error: item.error.message || JSON.stringify(item.error),
                });
              } else {
                console.log(`Mail sent successfully to ${contact.email}`);
                emailResults.push({ contact: contact.name, status: "success" });
              }
            });
          }
        } catch (error) {
          console.error("Emergency batch mail error:", error.message);
          // One error from the batch API means none of these went out, but we
          // still report each recipient so the caller can see the per-contact
          // failure instead of silently claiming delivery.
          emailResults.push(
            ...emailContacts.map((contact) => ({
              contact: contact.name,
              status: "failed",
              error: error.message,
            }))
          );
        }
      }
    }

    return res.status(200).json({
      message: "Emergency alerts sent!",
      smsResults,
      emailResults,
    });

  } catch (error) {
    console.error("Emergency alert error:", error);
    return res.status(500).json({ message: "Error sending emergency alerts", error: error.message });
  }
};

// Accepts a single recorded audio/video clip from the SOS flow, pushes it to
// Cloudinary, saves the link on the user's evidence array, and returns the URL
// so the frontend can immediately email it to emergency contacts.
const UploadEvidence = async (req, res) => {
  const { userId, type } = req.body;

  if (!userId || !req.file) {
    return res.status(400).json({ message: "userId and a media file are required" });
  }

  try {
    const url = await cloudinaryUploadEvidence(req.file.path);
    fs.unlink(req.file.path, (err) => {
      if (err) console.error("Error deleting local evidence file:", err);
    });

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $push: { evidence: { url, type: type === "audio" ? "audio" : "video" } } },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(201).json({ message: "Evidence uploaded", url });
  } catch (error) {
    console.error("Error in UploadEvidence:", error);
    res.status(500).json({ message: "An error occurred while uploading evidence" });
  }
};

// Sends a short follow-up email once an SOS evidence clip has finished
// uploading, so contacts get the recording link even though it arrives a
// little after the initial location alert.
const SendEvidenceInfo = async (req, res) => {
  try {
    const { contacts, evidenceUrl, senderName } = req.body;
    const displayName = senderName || "Someone";

    if (!evidenceUrl) {
      return res.status(400).json({ message: "evidenceUrl is required" });
    }

    const emailResults = [];
    if (contacts && contacts.length > 0) {
      const emailPromises = contacts
        .filter((contact) => contact.email)
        .map(async (contact) => {
          try {
            console.log('DEBUG evidence-mail using key prefix:', String(process.env.RESEND_API_KEY || '').slice(0, 8), 'length:', String(process.env.RESEND_API_KEY || '').length);
            const { error: sendError } = await resend.emails.send({
              from: "I'm Safe App <onboarding@resend.dev>",
              to: contact.email,
              subject: `Emergency evidence from ${displayName}`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <div style="background-color: #d32f2f; padding: 20px; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 22px;">SOS EVIDENCE</h1>
                  </div>
                  <div style="padding: 24px; background-color: #f9f9f9;">
                    <p style="font-size: 18px; margin: 0 0 16px;">Hi ${contact.name},</p>
                    <p style="font-size: 16px; margin: 0 0 20px;">A recording captured automatically during ${displayName}'s SOS alert is ready:</p>
                    <div style="text-align: center; margin: 24px 0;">
                      <a href="${evidenceUrl}" style="background-color: #d32f2f; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold; display: inline-block;">
                        View Recording
                      </a>
                    </div>
                  </div>
                  <div style="background-color: #333; padding: 10px; text-align: center;">
                    <p style="color: #999; margin: 0; font-size: 12px;">Sent automatically via I'm Safe - Women Safety App</p>
                  </div>
                </div>
              `,
            });

            // The Resend SDK does not always throw on failure - a rejected
            // send can come back as a resolved promise with an `error`
            // field instead. Checking only "did this throw?" was the bug:
            // it reported "success" even when Resend itself refused to
            // send the mail (e.g. rate limiting two sends back-to-back).
            if (sendError) {
              console.error(`Evidence mail rejected for ${contact.name}:`, sendError);
              return { contact: contact.name, status: "failed", error: sendError.message || JSON.stringify(sendError) };
            }

            return { contact: contact.name, status: "success" };
          } catch (error) {
            console.error(`Evidence mail error for ${contact.name}:`, error.message);
            return { contact: contact.name, status: "failed", error: error.message };
          }
        });
      const results = await Promise.all(emailPromises);
      emailResults.push(...results);
    }

    return res.status(200).json({ message: "Evidence link sent!", emailResults });
  } catch (error) {
    console.error("Send evidence error:", error);
    return res.status(500).json({ message: "Error sending evidence link", error: error.message });
  }
};

export { AddContact, DeleteContact, SendEmergencyInfo, UploadEvidence, SendEvidenceInfo };
