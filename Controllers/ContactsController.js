import User from "../Models/UserModel.js";
import { cloudinaryUpload } from "../Utils/Cloudinary.js";
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
    const { contacts, contactNumbers, location } = req.body;

    if (!location || !location.latitude || !location.longitude) {
      return res.status(400).json({ message: "Location is required" });
    }

    const mapsLink = `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`;
    const messageText = `EMERGENCY ALERT! Location: ${mapsLink} Please respond immediately.`;

    // SMS via Fast2SMS (disabled)
    const smsResults = [];

    // Email via Resend
    console.log("CONTACTS RECEIVED:", JSON.stringify(contacts, null, 2));
    const emailResults = [];
    if (contacts && contacts.length > 0) {
      const emailPromises = contacts
        .filter((contact) => {
          console.log(`Contact: ${contact.name}, Email: ${contact.email}`);
          return contact.email;
        })
        .map(async (contact) => {
          try {
            console.log(`Trying to send email to: ${contact.email}`);
            await resend.emails.send({
              from: "I'm Safe App <onboarding@resend.dev>",
              to: contact.email,
              subject: "🚨 EMERGENCY ALERT - Immediate Assistance Needed!",
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <div style="background-color: #ff4444; padding: 20px; text-align: center;">
                    <h1 style="color: white; margin: 0;">🚨 EMERGENCY ALERT</h1>
                  </div>
                  <div style="padding: 20px; background-color: #f9f9f9;">
                    <p style="font-size: 18px;"><strong>${contact.name}</strong>, someone needs your help immediately!</p>
                    <p>An emergency SOS has been triggered. Here is their current location:</p>
                    <div style="text-align: center; margin: 20px 0;">
                      <a href="${mapsLink}" style="background-color: #ff4444; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-size: 16px;">
                        📍 View Location on Maps
                      </a>
                    </div>
                    <p style="color: #666;">Please respond immediately and check on them!</p>
                  </div>
                  <div style="background-color: #333; padding: 10px; text-align: center;">
                    <p style="color: #999; margin: 0; font-size: 12px;">Sent via I'm Safe - Women Safety App</p>
                  </div>
                </div>
              `,
            });
            console.log(`Mail sent successfully to ${contact.email}`);
            return { contact: contact.name, status: "success" };
          } catch (error) {
            console.error(`MAIL ERROR for ${contact.name}:`, error.message);
            return { contact: contact.name, status: "failed", error: error.message };
          }
        });
      const results = await Promise.all(emailPromises);
      emailResults.push(...results);
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

export { AddContact, DeleteContact, SendEmergencyInfo };