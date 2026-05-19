import express from "express"
import dotenv from "dotenv"
import cookieParser from "cookie-parser";
import UserRoutes from "./Routes/UserRoutes.js"
import ContactRoutes from "./Routes/ContactsRoutes.js"
import ReviewRoutes from "./Routes/ReviewRoutes.js"
import ProfileRoutes from "./Routes/ProfileRoutes.js"
import ConnectToDb from "./Utils/ConnectDb.js";
import cors from "cors"
import path from "path"

dotenv.config()
const app = express()
const _dirname = path.resolve();

const corsOptions = {
  origin: process.env.NODE_ENV === "production"
    ? 'https://frontend-sable-pi-82.vercel.app'
    : ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser())

ConnectToDb();

app.use("/api/user", UserRoutes)
app.use("/api/contacts", ContactRoutes)
app.use("/api/reviews", ReviewRoutes)
app.use("/api/profile", ProfileRoutes)

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Something went wrong!", error: err.message });
});

app.get("/", (req, res) => {
  res.send("hello")
})

app.listen(process.env.PORT, () => {
  console.log("Server Started")
})