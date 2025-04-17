const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
require("dotenv").config();

const app = express();

app.use(cors({
  origin: "https://blog-it-neon.vercel.app",
  methods: ["POST", "GET", "PUT", "PATCH", "DELETE"],
  credentials: true,
}));

app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

let prisma;

(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();

  app.post("/api/signup", async (req, res) => {
    const { firstName, lastName, email, username, password } = req.body;

    try {
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [{ email }, { username }],
        },
      });

      if (existingUser) {
        return res.status(400).json({ message: "Email or username already taken" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      await prisma.user.create({
        data: {
          firstName,
          lastName,
          email,
          username,
          password: hashedPassword,
        },
      });

      res.status(201).json({ message: "Account created successfully" });
    } catch (error) {
      console.error("Signup Error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
 
  app.post("/api/login", async (req, res) => {
    const { identifier, password } = req.body;
    try {
      const user = await prisma.user.findFirst({
        where: {
          OR: [{ email: identifier }, { username: identifier }],
        },
      });

      if (!user) {
        return res.status(400).json({ message: "Invalid credentials" });
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(400).json({ message: "Invalid credentials" });
      }

      const token = jwt.sign(
        { userId: user.id, username: user.username },
        process.env.JWT_SECRET,
        { expiresIn: "2h" }
      );

      res.status(200).json({
        message: "Login successful",
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
      });
    } catch (error) {
      console.error("Login Error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

 
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, "uploads/");
    },
    filename: (req, file, cb) => {
      const uniqueName = `${Date.now()}-${file.originalname}`;
      cb(null, uniqueName);
    },
  });
  const upload = multer({ storage });
   app.post("/api/blogs", upload.single("image"), async (req, res) => {
    try {
      const { title, excerpt, body } = req.body;
      const imageUrl = `/uploads/${req.file.filename}`;

      const newPost = await prisma.blog.create({
        data: {
          title,
          excerpt,
          body,
          imageUrl,
        },
      });

      res.status(201).json({ message: "Blog created", blog: newPost });
    } catch (err) {
      console.error("Blog Error:", err);
      res.status(500).json({ message: "Failed to create blog post" });
    }
  });
  app.get("/api/blogs", async (req, res) => {
    try {
      const blogs = await prisma.blog.findMany({ orderBy: { createdAt: "desc" } });
      res.json(blogs);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch blogs" });
    }
  });
  app.delete("/api/blogs/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await prisma.blog.delete({ where: { id: parseInt(id) } });
      res.json({ message: "Blog deleted successfully" });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete blog" });
    }
  });
 const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
})();
