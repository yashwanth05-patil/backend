import express from "express";
import {
  StartLocationShare,
  UpdateLocationShare,
  StopLocationShare,
  GetLocationShare,
} from "../Controllers/LocationController.js";

const router = express.Router();

router.post("/start", StartLocationShare);
router.post("/update", UpdateLocationShare);
router.post("/stop", StopLocationShare);
router.get("/:shareId", GetLocationShare); // public, no auth - used by the /track page

export default router;
