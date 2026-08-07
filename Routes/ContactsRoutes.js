import express from "express";
import { AddContact, DeleteContact, SendEmergencyInfo, UploadEvidence, SendEvidenceInfo } from "../Controllers/ContactsController.js";
import { upload, evidenceUpload } from "../Middlewares/Multer.js";

const router = express.Router();


router.post("/addcontact", upload.single("photo"), async (req, res, next) => {
  try {
    await AddContact(req, res);
  } catch (error) {
    next(error); 
  }
});
router.delete("/delete-contact", DeleteContact)
router.post("/emergency", SendEmergencyInfo)

router.post("/upload-evidence", evidenceUpload.single("media"), async (req, res, next) => {
  try {
    await UploadEvidence(req, res);
  } catch (error) {
    next(error);
  }
});
router.post("/send-evidence", SendEvidenceInfo)

export default router;
