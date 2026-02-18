import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import { connectDB } from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import gradeRoutes from './routes/gradeRoutes.js';
import rankingRoutes from './routes/rankingRoutes.js';

dotenv.config();

await connectDB();

const app = express();

// Trust proxy for Render/Vercel (required for rate limiting)
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({
    origin: process.env.FRONTEND_URL ? [process.env.FRONTEND_URL, 'http://localhost:5173'] : true,
    credentials: true
}));
app.use(express.json());

app.get('/', (req, res) => {
    res.send('API is running...');
});

app.use('/api/auth', authRoutes);
app.use('/api/grades', gradeRoutes);
app.use('/api/rankings', rankingRoutes);

app.use((err, req, res, next) => {
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    res.status(statusCode);
    res.json({
        message: err.message,
        stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
});

const PORT = process.env.PORT || 5000;

console.log("Starting server...");
const server = app.listen(PORT, () => {
    console.log(`✅ Server is officially listening on port ${PORT}`);

    // Self-ping to keep Render awake (free tier sleeps after 15m)
    if (process.env.NODE_ENV === 'production') {
        const url = `https://classement-api.onrender.com`; // Change if your URL is different
        setInterval(() => {
            fetch(url).then(() => console.log(`[KEEP-ALIVE] Pinged ${url}`)).catch(err => console.error(`[KEEP-ALIVE] Error: ${err.message}`));
        }, 10 * 60 * 1000); // 10 minutes
    }
});

server.on('error', (err) => {
    console.error("❌ SERVER ERROR:", err);
});

process.on('SIGINT', () => {
    console.log("STOPPING SERVER (SIGINT)");
    server.close();
});

export default app;
