import express, { Request, Response, NextFunction } from "express";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";

import { config } from "./config.js";

import {
  createUser,
  deleteAllUsers,
  getUserByEmail,
  updateUser,
  upgradeUser,
} from "./db/queries/users.js";

import {
  createChirp,
  getChirps,
  getChirp,
  deleteChirp,
} from "./db/queries/chirps.js";

import {
  createRefreshToken,
  getUserFromRefreshToken,
  revokeRefreshToken,
} from "./db/queries/refreshTokens.js";

import {
  hashPassword,
  checkPasswordHash,
  makeJWT,
  makeRefreshToken,
  getBearerToken,
  getAPIKey,
  validateJWT,
} from "./auth.js";

const migrationClient = postgres(config.db.url, { max: 1 });

await migrate(
  drizzle(migrationClient),
  config.db.migrationConfig,
);

const app = express();

app.use(express.json());

const PORT = config.api.port;

class BadRequestError extends Error {
  statusCode: number;

  constructor(message: string) {
    super(message);
    this.statusCode = 400;
  }
}

class UnauthorizedError extends Error {
  statusCode: number;

  constructor(message: string) {
    super(message);
    this.statusCode = 401;
  }
}

class ForbiddenError extends Error {
  statusCode: number;

  constructor(message: string) {
    super(message);
    this.statusCode = 403;
  }
}

class NotFoundError extends Error {
  statusCode: number;

  constructor(message: string) {
    super(message);
    this.statusCode = 404;
  }
}

const middlewareLogResponses = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  res.on("finish", () => {
    const statusCode = res.statusCode;

    if (statusCode >= 400) {
      console.log(
        `[NON-OK] ${req.method} ${req.url} - Status: ${statusCode}`,
      );
    }
  });

  next();
};

function middlewareMetricsInc(
  _req: Request,
  _res: Response,
  next: NextFunction,
) {
  config.api.fileserverHits += 1;
  next();
}

const handlerReadiness = (_req: Request, res: Response) => {
  res.set("Content-Type", "text/plain; charset=utf-8");
  res.send("OK");
};

function handlerMetrics(_req: Request, res: Response) {
  res.set("Content-Type", "text/html; charset=utf-8");

  res.send(`
<html>
  <body>
    <h1>Welcome, Chirpy Admin</h1>
    <p>Chirpy has been visited ${config.api.fileserverHits} times!</p>
  </body>
</html>
`);
}

async function handlerReset(_req: Request, res: Response) {
  if (config.api.platform !== "dev") {
    throw new ForbiddenError("Forbidden");
  }

  config.api.fileserverHits = 0;

  await deleteAllUsers();

  res.send("OK");
}

async function handlerCreateUser(req: Request, res: Response) {
  const { email, password } = req.body;

  if (typeof email !== "string" || typeof password !== "string") {
    throw new BadRequestError("Invalid email or password");
  }

  const hashedPassword = await hashPassword(password);

  const user = await createUser({
    email,
    hashedPassword,
  });

  if (!user) {
    throw new BadRequestError("User already exists");
  }

  const { hashedPassword: _, ...userResponse } = user;

  res.status(201).json(userResponse);
}

async function handlerLogin(req: Request, res: Response) {
  const { email, password } = req.body;

  if (typeof email !== "string" || typeof password !== "string") {
    throw new UnauthorizedError("incorrect email or password");
  }

  const user = await getUserByEmail(email);

  if (!user) {
    throw new UnauthorizedError("incorrect email or password");
  }

  const passwordMatches = await checkPasswordHash(
    password,
    user.hashedPassword,
  );

  if (!passwordMatches) {
    throw new UnauthorizedError("incorrect email or password");
  }

  const token = makeJWT(
    user.id,
    3600,
    config.jwt.secret,
  );

  const refreshToken = makeRefreshToken();

  const expiresAt = new Date(
    Date.now() + 60 * 24 * 60 * 60 * 1000,
  );

  await createRefreshToken({
    token: refreshToken,
    userId: user.id,
    expiresAt,
    revokedAt: null,
  });

  const { hashedPassword: _, ...userResponse } = user;

  res.status(200).json({
    ...userResponse,
    token,
    refreshToken,
  });
}

async function handlerUpdateUser(req: Request, res: Response) {
  let token: string;

  try {
    token = getBearerToken(req);
  } catch {
    throw new UnauthorizedError("Invalid or missing token");
  }

  let userId: string;

  try {
    userId = validateJWT(token, config.jwt.secret);
  } catch {
    throw new UnauthorizedError("Invalid or expired token");
  }

  const { email, password } = req.body;

  if (typeof email !== "string" || typeof password !== "string") {
    throw new BadRequestError("Invalid email or password");
  }

  const hashedPassword = await hashPassword(password);

  const user = await updateUser(
    userId,
    email,
    hashedPassword,
  );

  if (!user) {
    throw new NotFoundError("User not found");
  }

  const { hashedPassword: _, ...userResponse } = user;

  res.status(200).json(userResponse);
}

async function handlerCreateChirp(req: Request, res: Response) {
  const { body } = req.body;

  if (typeof body !== "string") {
    throw new BadRequestError("Invalid request body");
  }

  if (body.length > 140) {
    throw new BadRequestError(
      "Chirp is too long. Max length is 140",
    );
  }

  let token: string;

  try {
    token = getBearerToken(req);
  } catch {
    throw new UnauthorizedError("Invalid or missing token");
  }

  let userId: string;

  try {
    userId = validateJWT(token, config.jwt.secret);
  } catch {
    throw new UnauthorizedError("Invalid or expired token");
  }

  const profaneWords = [
    "kerfuffle",
    "sharbert",
    "fornax",
  ];

  const words = body.split(" ");

  const cleanedWords = words.map((word) => {
    if (profaneWords.includes(word.toLowerCase())) {
      return "****";
    }

    return word;
  });

  const cleanedBody = cleanedWords.join(" ");

  const chirp = await createChirp({
    body: cleanedBody,
    userId,
  });

  res.status(201).json(chirp);
}

async function handlerGetChirps(
  req: Request,
  res: Response,
) {
  const authorId = req.query.authorId;
  const sort = req.query.sort;

  if (
    typeof authorId !== "undefined" &&
    typeof authorId !== "string"
  ) {
    throw new BadRequestError("Invalid authorId");
  }

  if (
    typeof sort !== "undefined" &&
    typeof sort !== "string"
  ) {
    throw new BadRequestError("Invalid sort");
  }

  if (sort !== undefined && sort !== "asc" && sort !== "desc") {
    throw new BadRequestError("Invalid sort");
  }

  const chirps = await getChirps(authorId);

  if (sort === "desc") {
    chirps.sort(
      (a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  res.status(200).json(chirps);
}

async function handlerGetChirp(
  req: Request,
  res: Response,
) {
  const { chirpId } = req.params;

  if (typeof chirpId !== "string") {
    throw new BadRequestError("Invalid chirp ID");
  }

  const chirp = await getChirp(chirpId);

  if (!chirp) {
    throw new NotFoundError("Chirp not found");
  }

  res.status(200).json(chirp);
}

async function handlerDeleteChirp(
  req: Request,
  res: Response,
) {
  let token: string;

  try {
    token = getBearerToken(req);
  } catch {
    throw new UnauthorizedError("Invalid or missing token");
  }

  let userId: string;

  try {
    userId = validateJWT(token, config.jwt.secret);
  } catch {
    throw new UnauthorizedError("Invalid or expired token");
  }

  const { chirpId } = req.params;

  if (typeof chirpId !== "string") {
    throw new BadRequestError("Invalid chirp ID");
  }

  const chirp = await getChirp(chirpId);

  if (!chirp) {
    throw new NotFoundError("Chirp not found");
  }

  if (chirp.userId !== userId) {
    throw new ForbiddenError("Forbidden");
  }

  await deleteChirp(chirpId);

  res.status(204).send();
}

async function handlerRefresh(
  req: Request,
  res: Response,
) {
  let refreshToken: string;

  try {
    refreshToken = getBearerToken(req);
  } catch {
    throw new UnauthorizedError("Invalid or missing token");
  }

  const result = await getUserFromRefreshToken(refreshToken);

  if (!result) {
    throw new UnauthorizedError("Invalid refresh token");
  }

  const { user, refreshToken: tokenRecord } = result;

  if (tokenRecord.revokedAt !== null) {
    throw new UnauthorizedError("Invalid refresh token");
  }

  if (tokenRecord.expiresAt <= new Date()) {
    throw new UnauthorizedError("Invalid refresh token");
  }

  const token = makeJWT(
    user.id,
    3600,
    config.jwt.secret,
  );

  res.status(200).json({
    token,
  });
}

async function handlerRevoke(
  req: Request,
  res: Response,
) {
  let refreshToken: string;

  try {
    refreshToken = getBearerToken(req);
  } catch {
    throw new UnauthorizedError("Invalid or missing token");
  }

  await revokeRefreshToken(refreshToken);

  res.status(204).send();
}

async function handlerPolkaWebhook(
  req: Request,
  res: Response,
) {
  let apiKey: string;

  try {
    apiKey = getAPIKey(req);
  } catch {
    throw new UnauthorizedError("Invalid API key");
  }

  if (apiKey !== config.api.polkaKey) {
    throw new UnauthorizedError("Invalid API key");
  }

  const { event, data } = req.body;

  if (event !== "user.upgraded") {
    res.status(204).send();
    return;
  }

  if (
    !data ||
    typeof data.userId !== "string"
  ) {
    throw new BadRequestError("Invalid webhook data");
  }

  const user = await upgradeUser(data.userId);

  if (!user) {
    throw new NotFoundError("User not found");
  }

  res.status(204).send();
}

const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  if (err instanceof BadRequestError) {
    res.status(err.statusCode).json({
      error: err.message,
    });
    return;
  }

  if (err instanceof UnauthorizedError) {
    res.status(err.statusCode).json({
      error: err.message,
    });
    return;
  }

  if (err instanceof ForbiddenError) {
    res.status(err.statusCode).json({
      error: err.message,
    });
    return;
  }

  if (err instanceof NotFoundError) {
    res.status(err.statusCode).json({
      error: err.message,
    });
    return;
  }

  console.log(err);

  res.status(500).json({
    error: "Something went wrong on our end",
  });
};

app.use(middlewareLogResponses);

app.get("/api/healthz", handlerReadiness);

app.post("/api/users", handlerCreateUser);

app.put("/api/users", handlerUpdateUser);

app.post("/api/login", handlerLogin);

app.post("/api/chirps", handlerCreateChirp);

app.get("/api/chirps", handlerGetChirps);

app.get("/api/chirps/:chirpId", handlerGetChirp);

app.delete("/api/chirps/:chirpId", handlerDeleteChirp);

app.post("/api/refresh", handlerRefresh);

app.post("/api/revoke", handlerRevoke);

app.post("/api/polka/webhooks", handlerPolkaWebhook);

app.get("/admin/metrics", handlerMetrics);

app.post("/admin/reset", handlerReset);

app.use("/app", middlewareMetricsInc);

app.use("/app", express.static("./src/app"));

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(
    `Server is running at http://localhost:${PORT}`,
  );
});