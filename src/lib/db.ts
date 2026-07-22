import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

// Define the Project typescript interface
export interface Project {
  id: string;
  name: string;
  website: string;
  total_score: number;
  recommendation: string;
  scores: {
    teamFounders: { score: number | null; max: number; reasoning: string; confidence: string };
    marketTiming: { score: number | null; max: number; reasoning: string; confidence: string };
    productProblem: { score: number | null; max: number; reasoning: string; confidence: string };
    techSecurity: { score: number | null; max: number; reasoning: string; confidence: string };
    tractionMetrics: { score: number | null; max: number; reasoning: string; confidence: string };
    businessMoat: { score: number | null; max: number; reasoning: string; confidence: string };
    tokenomics: { score: number | null; max: number; reasoning: string; confidence: string };
    dealValuation: { score: number | null; max: number; reasoning: string; confidence: string };
  };
  summary: string;
  detailed_assessment: string;
  strengths: string[];
  risks: string[];
  red_flags: string[];
  questions_for_founder: string[];
  raw_input?: string;
  created_at?: Date;
}

export interface BotCommand {
  id: number;
  type: 'GENERATE' | 'PUBLISH' | 'REGENERATE_THREAD' | 'REGENERATE_IMAGES' | 'REGENERATE_ALL' | 'CANCEL' | 'TRENDING' | 'UPDATE_CONFIG' | 'RESEARCH' | 'SOCIAL_SCAN';
  payload: any;
  status: 'pending' | 'processing' | 'done' | 'failed';
  error: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface BotStatus {
  id: number;
  last_seen: Date;
  uptime: number;
  config: any;
  status: 'idle' | 'working';
  is_online?: boolean;
}

export interface DraftArticle {
  id: string;
  topic: string;
  status: 'draft' | 'editing' | 'approved' | 'publishing' | 'published' | 'failed';
  version: number;
  payload: {
    title: string;
    article_md: string;
    tweets: string[];
    images: { role: 'thumbnail' | 'inline'; url: string }[];
    meta: Record<string, any>;
  };
  error: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface RecentArticle {
  id: number;
  title: string;
  slug: string | null;
  primus_url: string | null;
  azdag_url: string | null;
  x1_url: string | null;
  x2_url: string | null;
  created_at: Date;
}

export interface ScanReport {
  id: string;
  project_id: string;
  scanned_at: Date;
  payload: {
    project_name: string;
    scanned_at: string;
    channels: {
      platform: string;
      url: string;
      last_post_at: string | null;
      post_count_7d: number;
      follower_count: number;
      follower_delta_7d: number | null;
      engagement_notes: string;
    }[];
    activity_summary: string;
    progress_signals: string[];
    red_flags: string[];
    momentum: 'accelerating' | 'steady' | 'slowing' | 'inactive';
    overall_note: string;
  };
  status: string;
  error: string | null;
  created_at: Date;
}


const isProduction = process.env.NODE_ENV === 'production';
const databaseUrl = process.env.DATABASE_URL;

let pool: Pool | null = null;
let useLocalDb = false;
function getDbDir() {
  const isVercel = process.env.VERCEL === '1' || process.env.NOW_BUILDER === '1' || (typeof process.cwd === 'function' && process.cwd().startsWith('/var/task'));
  return isVercel ? '/tmp/.local_db' : path.join(process.cwd(), '.local_db');
}

const dbDir = getDbDir();
const localDbPath = path.join(dbDir, 'projects.json');

// Ensure local db directory exists if fallback is used
function ensureLocalDb() {
  const dir = path.dirname(localDbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(localDbPath)) {
    fs.writeFileSync(localDbPath, JSON.stringify([], null, 2));
  }
}

if (databaseUrl) {
  try {
    // Strip sslmode=require to prevent it from overriding ssl.rejectUnauthorized in pg driver
    const cleanConnectionString = databaseUrl.replace(/[?&]sslmode=require/g, '');
    pool = new Pool({
      connectionString: cleanConnectionString,
      ssl: {
        rejectUnauthorized: false // Required for Neon / Vercel Postgres connection
      },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  } catch (error) {
    if (isProduction) {
      console.error('CRITICAL: Failed to initialize PostgreSQL pool in production:', error);
    } else {
      console.error('Failed to initialize PostgreSQL pool, falling back to local file database:', error);
      useLocalDb = true;
      ensureLocalDb();
    }
  }
} else {
  console.warn('DATABASE_URL is not set.');
  if (!isProduction) {
    useLocalDb = true;
    ensureLocalDb();
  }
}

// Automatically create table if PostgreSQL is active
let tableChecked = false;
async function ensureTable() {
  if (useLocalDb || !pool || tableChecked) return;
  
  try {
    const client = await pool.connect();
    try {
      // First, check which required tables already exist
      const requiredTables = ['projects', 'bot_commands', 'bot_status', 'draft_articles', 'scan_reports', 'recent_articles'];
      const existingRes = await client.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = ANY($1);
      `, [requiredTables]);
      const existingTables = new Set(existingRes.rows.map(r => r.table_name));
      const missingTables = requiredTables.filter(t => !existingTables.has(t));

      if (missingTables.length === 0) {
        // All tables exist — try to add new columns if upgrading from old schema (safe ALTER)
        try {
          await client.query('ALTER TABLE projects ADD COLUMN IF NOT EXISTS red_flags JSONB DEFAULT \'[]\'::jsonb;');
          await client.query('ALTER TABLE projects ADD COLUMN IF NOT EXISTS questions_for_founder JSONB DEFAULT \'[]\'::jsonb;');
        } catch {
          // Ignore ALTER errors — columns may already exist or user may lack ALTER permission
        }
        tableChecked = true;
        console.log('PostgreSQL database schema verified — all tables exist.');
        return;
      }

      // Some tables are missing — attempt to create them
      console.log(`Missing tables: ${missingTables.join(', ')}. Attempting to create...`);

      if (missingTables.includes('projects')) {
        await client.query(`
          CREATE TABLE IF NOT EXISTS projects (
            id UUID PRIMARY KEY,
            name TEXT NOT NULL,
            website TEXT NOT NULL,
            total_score INTEGER NOT NULL,
            recommendation TEXT NOT NULL,
            scores JSONB NOT NULL,
            summary TEXT NOT NULL,
            detailed_assessment TEXT NOT NULL,
            strengths JSONB NOT NULL,
            risks JSONB NOT NULL,
            red_flags JSONB DEFAULT '[]'::jsonb,
            questions_for_founder JSONB DEFAULT '[]'::jsonb,
            raw_input TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);
      } else {
        // Add new columns if upgrading from old schema
        await client.query('ALTER TABLE projects ADD COLUMN IF NOT EXISTS red_flags JSONB DEFAULT \'[]\'::jsonb;');
        await client.query('ALTER TABLE projects ADD COLUMN IF NOT EXISTS questions_for_founder JSONB DEFAULT \'[]\'::jsonb;');
      }
      
      if (missingTables.includes('bot_commands')) {
        await client.query(`
          CREATE TABLE IF NOT EXISTS bot_commands (
            id SERIAL PRIMARY KEY,
            type VARCHAR(50) NOT NULL,
            payload JSONB DEFAULT '{}'::jsonb,
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            error TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `);
        await client.query('CREATE INDEX IF NOT EXISTS idx_bot_commands_status ON bot_commands(status);');
      }

      if (missingTables.includes('bot_status')) {
        await client.query(`
          CREATE TABLE IF NOT EXISTS bot_status (
            id INT PRIMARY KEY DEFAULT 1,
            last_seen TIMESTAMP WITH TIME ZONE NOT NULL,
            uptime INT NOT NULL,
            config JSONB NOT NULL DEFAULT '{}'::jsonb,
            status VARCHAR(20) NOT NULL DEFAULT 'idle',
            CONSTRAINT check_single_row CHECK (id = 1)
          );
        `);
      }

      if (missingTables.includes('draft_articles')) {
        await client.query(`
          CREATE TABLE IF NOT EXISTS draft_articles (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            topic VARCHAR(500) NOT NULL,
            status VARCHAR(30) NOT NULL DEFAULT 'draft',
            version INT NOT NULL DEFAULT 1,
            payload JSONB NOT NULL,
            error TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `);
        await client.query('CREATE INDEX IF NOT EXISTS idx_draft_articles_status ON draft_articles(status);');
      }

      if (missingTables.includes('scan_reports')) {
        await client.query(`
          CREATE TABLE IF NOT EXISTS scan_reports (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            project_id UUID NOT NULL,
            scanned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            payload JSONB NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'done',
            error TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `);
        await client.query('CREATE INDEX IF NOT EXISTS idx_scan_reports_project_id ON scan_reports(project_id);');
      }

      if (missingTables.includes('recent_articles')) {
        await client.query(`
          CREATE TABLE IF NOT EXISTS recent_articles (
            id SERIAL PRIMARY KEY,
            title VARCHAR(500) NOT NULL,
            slug VARCHAR(255),
            primus_url VARCHAR(1000),
            azdag_url VARCHAR(1000),
            x1_url VARCHAR(1000),
            x2_url VARCHAR(1000),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `);
      }

      tableChecked = true;
      console.log('PostgreSQL database schema verified/created successfully.');
    } finally {
      client.release();
    }
  } catch (error) {
    // If tables already exist but we lack DDL permissions, still use PostgreSQL for data operations
    if (error && typeof error === 'object' && 'code' in error && error.code === '42501') {
      console.warn('Insufficient permissions for DDL operations, but tables may already exist. Continuing with PostgreSQL.');
      tableChecked = true;
      return;
    }
    if (isProduction) {
      // In production, don't fall back to local DB — Vercel filesystem is read-only
      // Mark tableChecked to avoid retrying, let individual queries throw their own errors
      console.error('Error verifying database tables in production (will retry on next request):', error);
    } else {
      console.error('Error verifying database tables, falling back to local db:', error);
      useLocalDb = true;
      ensureLocalDb();
    }
  }
}


// Local JSON File DB helper operations
function getLocalProjects(): Project[] {
  if (isProduction) return [];
  ensureLocalDb();
  try {
    const data = fs.readFileSync(localDbPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading local DB:', error);
    return [];
  }
}

function saveLocalProjects(projects: Project[]) {
  if (isProduction) return;
  ensureLocalDb();
  try {
    fs.writeFileSync(localDbPath, JSON.stringify(projects, null, 2));
  } catch (error) {
    console.error('Error writing to local DB:', error);
  }
}

// DATABASE PUBLIC API
function normalizeWebsiteUrl(url: string): string {
  if (!url) return '';
  return url.toLowerCase()
    .replace(/^(https?:\/\/)?(www\.)?/, '')
    .replace(/\/+$/, '')
    .trim();
}

// DATABASE PUBLIC API
export async function saveProject(project: Omit<Project, 'id' | 'created_at'>): Promise<Project> {
  const newProject: Project = {
    ...project,
    id: crypto.randomUUID(),
    created_at: new Date()
  };

  await ensureTable();

  const normalizedWeb = normalizeWebsiteUrl(project.website);

  if (useLocalDb) {
    const projects = getLocalProjects();
    const existingIndex = projects.findIndex(p => normalizeWebsiteUrl(p.website) === normalizedWeb);
    
    if (existingIndex >= 0) {
      const existing = projects[existingIndex];
      const updatedProject: Project = {
        ...existing,
        ...project,
      };
      projects[existingIndex] = updatedProject;
      saveLocalProjects(projects);
      return updatedProject;
    } else {
      projects.push(newProject);
      saveLocalProjects(projects);
      return newProject;
    }
  }

  if (!pool) throw new Error('Database pool not initialized');

  // Query existing projects to find if we have a matching normalized website
  const checkRes = await pool.query('SELECT id, website FROM projects;');
  const existingProject = checkRes.rows.find(row => normalizeWebsiteUrl(row.website) === normalizedWeb);

  if (existingProject) {
    const query = `
      UPDATE projects SET 
        name = $1, 
        website = $2, 
        total_score = $3, 
        recommendation = $4, 
        scores = $5, 
        summary = $6, 
        detailed_assessment = $7, 
        strengths = $8, 
        risks = $9, 
        red_flags = $10, 
        questions_for_founder = $11, 
        raw_input = $12
      WHERE id = $13
      RETURNING created_at;
    `;
    const values = [
      project.name,
      project.website,
      project.total_score,
      project.recommendation,
      JSON.stringify(project.scores),
      project.summary,
      project.detailed_assessment,
      JSON.stringify(project.strengths),
      JSON.stringify(project.risks),
      JSON.stringify(project.red_flags),
      JSON.stringify(project.questions_for_founder),
      project.raw_input || null,
      existingProject.id
    ];
    const result = await pool.query(query, values);
    return {
      ...project,
      id: existingProject.id,
      created_at: result.rows[0].created_at
    };
  }

  const query = `
    INSERT INTO projects (
      id, name, website, total_score, recommendation, 
      scores, summary, detailed_assessment, strengths, risks, 
      red_flags, questions_for_founder, raw_input
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING id, created_at;
  `;

  const values = [
    newProject.id,
    newProject.name,
    newProject.website,
    newProject.total_score,
    newProject.recommendation,
    JSON.stringify(newProject.scores),
    newProject.summary,
    newProject.detailed_assessment,
    JSON.stringify(newProject.strengths),
    JSON.stringify(newProject.risks),
    JSON.stringify(newProject.red_flags),
    JSON.stringify(newProject.questions_for_founder),
    newProject.raw_input || null
  ];

  const result = await pool.query(query, values);
  newProject.created_at = result.rows[0].created_at;
  return newProject;
}

export async function getAllProjects(search = '', sortBy: 'score' | 'date' = 'date'): Promise<Project[]> {
  await ensureTable();

  if (useLocalDb) {
    let projects = getLocalProjects();
    
    // Filter
    if (search.trim()) {
      const queryLower = search.toLowerCase();
      projects = projects.filter(p => p.name.toLowerCase().includes(queryLower) || p.website.toLowerCase().includes(queryLower));
    }
    
    // Sort
    projects.sort((a, b) => {
      if (sortBy === 'score') {
        return b.total_score - a.total_score;
      } else {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      }
    });

    return projects;
  }

  if (!pool) throw new Error('Database pool not initialized');

  let query = `
    SELECT id, name, website, total_score, recommendation, 
           scores, summary, detailed_assessment, strengths, risks, 
           red_flags, questions_for_founder, raw_input, created_at
    FROM projects
  `;
  const values: any[] = [];

  if (search.trim()) {
    query += ` WHERE name ILIKE $1 OR website ILIKE $1`;
    values.push(`%${search.trim()}%`);
  }

  if (sortBy === 'score') {
    query += ` ORDER BY total_score DESC, created_at DESC`;
  } else {
    query += ` ORDER BY created_at DESC`;
  }

  const result = await pool.query(query, values);
  
  return result.rows.map(row => ({
    id: row.id,
    name: row.name,
    website: row.website,
    total_score: row.total_score,
    recommendation: row.recommendation,
    scores: typeof row.scores === 'string' ? JSON.parse(row.scores) : row.scores,
    summary: row.summary,
    detailed_assessment: row.detailed_assessment,
    strengths: typeof row.strengths === 'string' ? JSON.parse(row.strengths) : row.strengths,
    risks: typeof row.risks === 'string' ? JSON.parse(row.risks) : row.risks,
    red_flags: typeof row.red_flags === 'string' ? JSON.parse(row.red_flags) : (row.red_flags || []),
    questions_for_founder: typeof row.questions_for_founder === 'string' ? JSON.parse(row.questions_for_founder) : (row.questions_for_founder || []),
    raw_input: row.raw_input,
    created_at: row.created_at
  }));
}

export async function getProjectById(id: string): Promise<Project | null> {
  await ensureTable();

  if (useLocalDb) {
    const projects = getLocalProjects();
    const project = projects.find(p => p.id === id);
    return project || null;
  }

  if (!pool) throw new Error('Database pool not initialized');

  const query = `
    SELECT id, name, website, total_score, recommendation, 
           scores, summary, detailed_assessment, strengths, risks, 
           red_flags, questions_for_founder, raw_input, created_at
    FROM projects
    WHERE id = $1
  `;
  
  const result = await pool.query(query, [id]);
  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    website: row.website,
    total_score: row.total_score,
    recommendation: row.recommendation,
    scores: typeof row.scores === 'string' ? JSON.parse(row.scores) : row.scores,
    summary: row.summary,
    detailed_assessment: row.detailed_assessment,
    strengths: typeof row.strengths === 'string' ? JSON.parse(row.strengths) : row.strengths,
    risks: typeof row.risks === 'string' ? JSON.parse(row.risks) : row.risks,
    red_flags: typeof row.red_flags === 'string' ? JSON.parse(row.red_flags) : (row.red_flags || []),
    questions_for_founder: typeof row.questions_for_founder === 'string' ? JSON.parse(row.questions_for_founder) : (row.questions_for_founder || []),
    raw_input: row.raw_input,
    created_at: row.created_at
  };
}

export async function deleteProject(id: string): Promise<boolean> {
  await ensureTable();

  if (useLocalDb) {
    const projects = getLocalProjects();
    const initialLength = projects.length;
    const filtered = projects.filter(p => p.id !== id);
    saveLocalProjects(filtered);
    return filtered.length < initialLength;
  }

  if (!pool) throw new Error('Database pool not initialized');

  const query = `DELETE FROM projects WHERE id = $1`;
  const result = await pool.query(query, [id]);
  return (result.rowCount ?? 0) > 0;
}

// ==========================================
// BOT CONTROL & INTEGRATION DATABASE HELPERS
// ==========================================

const localCommandsPath = path.join(dbDir, 'bot_commands.json');
const localStatusPath = path.join(dbDir, 'bot_status.json');
const localDraftsPath = path.join(dbDir, 'draft_articles.json');
const localRecentPath = path.join(dbDir, 'recent_articles.json');
const localReportsPath = path.join(dbDir, 'scan_reports.json');


function ensureFileExists(filePath: string, defaultContent: any) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultContent, null, 2));
  }
}

function getLocalData<T>(filePath: string, defaultContent: T): T {
  ensureFileExists(filePath, defaultContent);
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
    return defaultContent;
  }
}

function saveLocalData<T>(filePath: string, data: T) {
  ensureFileExists(filePath, data);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Error writing ${filePath}:`, error);
  }
}

export async function createBotCommand(type: BotCommand['type'], payload: any): Promise<BotCommand> {
  await ensureTable();
  const newCommand: BotCommand = {
    id: useLocalDb ? Date.now() : 0,
    type,
    payload,
    status: 'pending',
    error: null,
    created_at: new Date(),
    updated_at: new Date()
  };

  if (useLocalDb) {
    const commands = getLocalData<BotCommand[]>(localCommandsPath, []);
    commands.push(newCommand);
    saveLocalData(localCommandsPath, commands);
    return newCommand;
  }

  if (!pool) throw new Error('Database pool not initialized');
  const result = await pool.query(`
    INSERT INTO bot_commands (type, payload, status, error, created_at, updated_at)
    VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING id, created_at, updated_at;
  `, [type, JSON.stringify(payload), 'pending', null]);

  newCommand.id = result.rows[0].id;
  newCommand.created_at = result.rows[0].created_at;
  newCommand.updated_at = result.rows[0].updated_at;
  return newCommand;
}

export async function getBotCommandById(id: number): Promise<BotCommand | null> {
  await ensureTable();
  if (useLocalDb) {
    const commands = getLocalData<BotCommand[]>(localCommandsPath, []);
    return commands.find(c => c.id === id) || null;
  }

  if (!pool) throw new Error('Database pool not initialized');
  const result = await pool.query(`
    SELECT id, type, payload, status, error, created_at, updated_at
    FROM bot_commands
    WHERE id = $1
  `, [id]);

  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    ...row,
    payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload
  };
}


export async function getBotCommands(limit = 20): Promise<BotCommand[]> {
  await ensureTable();
  if (useLocalDb) {
    const commands = getLocalData<BotCommand[]>(localCommandsPath, []);
    return commands.slice(-limit).reverse();
  }

  if (!pool) throw new Error('Database pool not initialized');
  const result = await pool.query(`
    SELECT id, type, payload, status, error, created_at, updated_at
    FROM bot_commands
    ORDER BY created_at DESC
    LIMIT $1
  `, [limit]);

  return result.rows.map(row => ({
    ...row,
    payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload
  }));
}

export async function getBotStatus(): Promise<BotStatus | null> {
  await ensureTable();
  if (useLocalDb) {
    const statuses = getLocalData<BotStatus[]>(localStatusPath, [{
      id: 1,
      last_seen: new Date(),
      uptime: 3600,
      config: { mock_mode: true },
      status: 'idle',
      is_online: true
    }]);
    return statuses[0] || null;
  }

  if (!pool) throw new Error('Database pool not initialized');
  const result = await pool.query(`
    SELECT id, last_seen, uptime, config, status
    FROM bot_status
    WHERE id = 1
  `);

  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  const lastSeenDate = new Date(row.last_seen);
  // Bot heartbeat runs every 10s; allow 90s buffer to survive PM2 restarts and DNS blips
  const isOnline = (new Date().getTime() - lastSeenDate.getTime()) < 90000;
  return {
    ...row,
    last_seen: lastSeenDate,
    config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
    is_online: isOnline
  };
}

export async function getDraftArticles(status?: string): Promise<DraftArticle[]> {
  await ensureTable();
  if (useLocalDb) {
    const drafts = getLocalData<DraftArticle[]>(localDraftsPath, []);
    let filtered = drafts;
    if (status) {
      filtered = drafts.filter(d => d.status === status);
    }
    return filtered.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }

  if (!pool) throw new Error('Database pool not initialized');
  let query = `
    SELECT id, topic, status, version, payload, error, created_at, updated_at
    FROM draft_articles
  `;
  const values: any[] = [];
  if (status) {
    query += ` WHERE status = $1`;
    values.push(status);
  }
  query += ` ORDER BY updated_at DESC`;

  const result = await pool.query(query, values);
  return result.rows.map(row => ({
    ...row,
    payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload
  }));
}

export async function getDraftArticleById(id: string): Promise<DraftArticle | null> {
  await ensureTable();
  if (useLocalDb) {
    const drafts = getLocalData<DraftArticle[]>(localDraftsPath, []);
    return drafts.find(d => d.id === id) || null;
  }

  if (!pool) throw new Error('Database pool not initialized');
  const result = await pool.query(`
    SELECT id, topic, status, version, payload, error, created_at, updated_at
    FROM draft_articles
    WHERE id = $1
  `, [id]);

  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    ...row,
    payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload
  };
}

export async function updateDraftArticle(
  id: string, 
  updates: { 
    topic?: string; 
    status?: DraftArticle['status']; 
    payload?: DraftArticle['payload']; 
    error?: string | null 
  }
): Promise<DraftArticle | null> {
  await ensureTable();
  if (useLocalDb) {
    const drafts = getLocalData<DraftArticle[]>(localDraftsPath, []);
    const idx = drafts.findIndex(d => d.id === id);
    if (idx === -1) return null;
    drafts[idx] = {
      ...drafts[idx],
      ...updates,
      version: drafts[idx].version + 1,
      updated_at: new Date()
    };
    saveLocalData(localDraftsPath, drafts);
    return drafts[idx];
  }

  if (!pool) throw new Error('Database pool not initialized');
  
  const setClauses: string[] = ['version = version + 1', 'updated_at = CURRENT_TIMESTAMP'];
  const values: any[] = [id];
  let paramIdx = 2;

  if (updates.topic !== undefined) {
    setClauses.push(`topic = $${paramIdx++}`);
    values.push(updates.topic);
  }
  if (updates.status !== undefined) {
    setClauses.push(`status = $${paramIdx++}`);
    values.push(updates.status);
  }
  if (updates.payload !== undefined) {
    setClauses.push(`payload = $${paramIdx++}`);
    values.push(JSON.stringify(updates.payload));
  }
  if (updates.error !== undefined) {
    setClauses.push(`error = $${paramIdx++}`);
    values.push(updates.error);
  }

  const query = `
    UPDATE draft_articles
    SET ${setClauses.join(', ')}
    WHERE id = $1
    RETURNING id, topic, status, version, payload, error, created_at, updated_at;
  `;

  const result = await pool.query(query, values);
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    ...row,
    payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload
  };
}

export async function saveDraftArticle(topic: string, payload: DraftArticle['payload']): Promise<DraftArticle> {
  await ensureTable();
  const newDraft: DraftArticle = {
    id: useLocalDb ? crypto.randomUUID() : '',
    topic,
    status: 'draft',
    version: 1,
    payload,
    error: null,
    created_at: new Date(),
    updated_at: new Date()
  };

  if (useLocalDb) {
    const drafts = getLocalData<DraftArticle[]>(localDraftsPath, []);
    drafts.push(newDraft);
    saveLocalData(localDraftsPath, drafts);
    return newDraft;
  }

  if (!pool) throw new Error('Database pool not initialized');
  const result = await pool.query(`
    INSERT INTO draft_articles (topic, status, version, payload, error, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING id, created_at, updated_at;
  `, [topic, 'draft', 1, JSON.stringify(payload), null]);

  newDraft.id = result.rows[0].id;
  newDraft.created_at = result.rows[0].created_at;
  newDraft.updated_at = result.rows[0].updated_at;
  return newDraft;
}

export async function getRecentArticles(limit = 10): Promise<RecentArticle[]> {
  await ensureTable();
  if (useLocalDb) {
    const articles = getLocalData<RecentArticle[]>(localRecentPath, []);
    return articles.slice(-limit).reverse();
  }

  if (!pool) throw new Error('Database pool not initialized');
  const result = await pool.query(`
    SELECT id, title, slug, primus_url, azdag_url, x1_url, x2_url, created_at
    FROM recent_articles
    ORDER BY created_at DESC
    LIMIT $1
  `, [limit]);

  return result.rows;
}

export async function getScanReportsByProjectId(projectId: string): Promise<ScanReport[]> {
  await ensureTable();
  if (useLocalDb) {
    const reports = getLocalData<ScanReport[]>(localReportsPath, []);
    return reports
      .filter(r => r.project_id === projectId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  if (!pool) throw new Error('Database pool not initialized');
  const result = await pool.query(`
    SELECT id, project_id, scanned_at, payload, status, error, created_at
    FROM scan_reports
    WHERE project_id = $1
    ORDER BY created_at DESC
  `, [projectId]);

  return result.rows.map(row => ({
    ...row,
    payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload
  }));
}

export async function getLatestScanReportForEachProject(): Promise<Record<string, ScanReport>> {
  await ensureTable();
  if (useLocalDb) {
    const reports = getLocalData<ScanReport[]>(localReportsPath, []);
    const latestMap: Record<string, ScanReport> = {};
    const sorted = [...reports].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    for (const r of sorted) {
      latestMap[r.project_id] = r;
    }
    return latestMap;
  }

  if (!pool) throw new Error('Database pool not initialized');
  const result = await pool.query(`
    SELECT DISTINCT ON (project_id) id, project_id, scanned_at, payload, status, error, created_at
    FROM scan_reports
    ORDER BY project_id, created_at DESC
  `);

  const latestMap: Record<string, ScanReport> = {};
  for (const row of result.rows) {
    latestMap[row.project_id] = {
      ...row,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload
    };
  }
  return latestMap;
}

export async function createScanReport(report: Omit<ScanReport, 'id' | 'created_at'>): Promise<ScanReport> {
  await ensureTable();
  const newReport: ScanReport = {
    ...report,
    id: crypto.randomUUID(),
    created_at: new Date()
  };

  if (useLocalDb) {
    const reports = getLocalData<ScanReport[]>(localReportsPath, []);
    reports.push(newReport);
    saveLocalData(localReportsPath, reports);
    return newReport;
  }

  if (!pool) throw new Error('Database pool not initialized');
  const result = await pool.query(`
    INSERT INTO scan_reports (id, project_id, scanned_at, payload, status, error, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
    RETURNING id, created_at;
  `, [
    newReport.id,
    newReport.project_id,
    newReport.scanned_at,
    JSON.stringify(newReport.payload),
    newReport.status,
    newReport.error
  ]);

  newReport.id = result.rows[0].id;
  newReport.created_at = result.rows[0].created_at;
  return newReport;
}


