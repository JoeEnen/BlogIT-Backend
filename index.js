const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const app = express();

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://blog-it-neon.vercel.app",
      "https://blog-it-git-main-josephs-projects-bd661498.vercel.app",
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = "uploads/";
    if (!fs.existsSync(folder)) fs.mkdirSync(folder);
    cb(null, folder);
  },
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Access denied" });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid token" });
    req.user = user;
    next();
  });
}

let prisma;
(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();

  app.post("/api/signup", async (req, res) => {
    const { firstName, lastName, email, username, password } = req.body;
    try {
      const existing = await prisma.user.findFirst({
        where: { OR: [{ email }, { username }] },
      });
      if (existing)
        return res.status(400).json({ message: "Email or username already exists" });

      const hashed = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: { firstName, lastName, email, username, password: hashed },
      });

      res.status(201).json({ message: "Account created", user });
    } catch (err) {
      console.error("Signup error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/login", async (req, res) => {
    const { identifier, password } = req.body;
    try {
      const user = await prisma.user.findFirst({
        where: { OR: [{ email: identifier }, { username: identifier }] },
      });

      if (!user || !(await bcrypt.compare(password, user.password)))
        return res.status(400).json({ message: "Invalid credentials" });

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
    } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });
 
  app.get("/api/me", authenticateToken, async (req, res) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
      });
      res.json(user);
    } catch {
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
 
  app.put("/api/profile", authenticateToken, upload.single("profilePicture"), async (req, res) => {
    try {
      const { phone, bio, occupation, status, secondaryEmail } = req.body;
      const updateData = { phone, bio, occupation, status, secondaryEmail };

      if (req.file) {
        updateData.profilePicture = `/uploads/${req.file.filename}`;
      }

      if (secondaryEmail) {
        const exists = await prisma.user.findFirst({
          where: { secondaryEmail, NOT: { id: req.user.userId } },
        });
        if (exists)
          return res.status(400).json({ message: "Secondary email already taken" });
      }

      const user = await prisma.user.update({
        where: { id: req.user.userId },
        data: updateData,
      });

      res.json({ message: "Profile updated", user });
    } catch (err) {
      console.error("Profile update error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });
 
  app.put("/api/personal", authenticateToken, async (req, res) => {
    const { firstName, lastName, email, username } = req.body;
    try {
      const exists = await prisma.user.findFirst({
        where: {
          OR: [{ email }, { username }],
          NOT: { id: req.user.userId },
        },
      });
      if (exists)
        return res.status(400).json({ message: "Email or username taken" });

      const updated = await prisma.user.update({
        where: { id: req.user.userId },
        data: { firstName, lastName, email, username },
      });

      res.json({ message: "Personal info updated", user: updated });
    } catch (err) {
      res.status(500).json({ message: "Failed to update personal info" });
    }
  });
 
  app.put("/api/password", authenticateToken, async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    try {
      const user = await prisma.user.findUnique({ where: { id: req.user.userId } });

      const valid = await bcrypt.compare(oldPassword, user.password);
      if (!valid) return res.status(400).json({ message: "Incorrect old password" });

      const hashed = await bcrypt.hash(newPassword, 10);
      await prisma.user.update({
        where: { id: req.user.userId },
        data: { password: hashed },
      });

      res.json({ message: "Password updated" });
    } catch {
      res.status(500).json({ message: "Failed to update password" });
    }
  });

  app.post("/api/blogs", upload.single("image"), async (req, res) => {
    try {
      const { title, excerpt, body, authorId } = req.body;
      const imageUrl = `/uploads/${req.file.filename}`;

      const blog = await prisma.blog.create({
        data: { title, excerpt, body, imageUrl, authorId: parseInt(authorId) },
      });

      res.status(201).json({ message: "Blog created", blog });
    } catch {
      res.status(500).json({ message: "Failed to create blog" });
    }
  });
 
  app.get("/api/blogs", async (req, res) => {
    try {
      const blogs = await prisma.blog.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          author: {
            select: { id: true, firstName: true, lastName: true, username: true },
          },
        },
      });
      res.json(blogs);
    } catch {
      res.status(500).json({ message: "Failed to fetch blogs" });
    }
  });
 
  app.get("/api/blogs/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const blog = await prisma.blog.findUnique({
        where: { id: parseInt(id) },
        include: {
          author: {
            select: { id: true, firstName: true, lastName: true, username: true },
          },
        },
      });

      if (!blog) return res.status(404).json({ message: "Blog not found" });

      const relatedBlogs = await prisma.blog.findMany({
        where: { authorId: blog.authorId, NOT: { id: blog.id } },
        take: 5,
        orderBy: { createdAt: "desc" },
      });

      res.json({ blog, relatedBlogs });
    } catch {
      res.status(500).json({ message: "Error fetching blog" });
    }
  });
 
  app.get("/api/myblogs/:userId", async (req, res) => {
    try {
      const blogs = await prisma.blog.findMany({
        where: { authorId: parseInt(req.params.userId) },
        orderBy: { createdAt: "desc" },
      });
      res.json(blogs);
    } catch {
      res.status(500).json({ message: "Failed to fetch user blogs" });
    }
  });
 
  app.put("/api/blogs/:id", upload.single("image"), async (req, res) => {
    try {
      const { title, excerpt, body } = req.body;
      const data = { title, excerpt, body };
      if (req.file) data.imageUrl = `/uploads/${req.file.filename}`;

      const blog = await prisma.blog.update({
        where: { id: parseInt(req.params.id) },
        data,
      });

      res.json({ message: "Blog updated", blog });
    } catch {
      res.status(500).json({ message: "Failed to update blog" });
    }
  });
 
  app.delete("/api/blogs/:id", async (req, res) => {
    try {
      await prisma.blog.delete({ where: { id: parseInt(req.params.id) } });
      res.json({ message: "Blog deleted" });
    } catch {
      res.status(500).json({ message: "Failed to delete blog" });
    }
  });
 
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
})();
