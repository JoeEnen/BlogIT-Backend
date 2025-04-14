const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const { PrismaClient } = require("./generated/prisma");
const prisma = new PrismaClient();

const app = express();

app.use(cors());
app.use(express.json());

// s/p
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
    res.status(500).json({ message: "Internal server ran into a problem. Try again later." });
  }
});

// Log
app.post("/api/login", async (req, res) => {
  const { identifier, password } = req.body;

  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { username: identifier }
        ]
      }
    });

    if (!user) {
      return res.status(400).json({ message: "Email or password wrong. Try again" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: "Email or password wrong. Try again" });
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    res.status(200).json({
      message: "Login successful. Welcome",
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      }
    });

  } catch (error) {
    console.error("Login unsuccessful:", error);
    res.status(500).json({ message: "Something went wrong. Please try again after a while." });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
