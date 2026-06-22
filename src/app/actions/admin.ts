'use server';

import { revalidatePath } from 'next/cache';
import {
  createBotCommand,
  getBotCommands,
  getBotStatus,
  getDraftArticles,
  getDraftArticleById,
  updateDraftArticle,
  getRecentArticles,
  BotCommand,
  BotStatus,
  DraftArticle,
  RecentArticle
} from '@/lib/db';
import { ActionResult } from '../actions';

/**
 * Server Action: Get the current Bot Status (heartbeat & metrics)
 */
export async function getBotStatusAction(): Promise<BotStatus | null> {
  try {
    return await getBotStatus();
  } catch (error) {
    console.error('Error fetching bot status:', error);
    return null;
  }
}

/**
 * Server Action: Dispatch a command to the VPS Bot via bot_commands table
 */
export async function sendBotCommandAction(
  type: BotCommand['type'],
  payload: any = {}
): Promise<ActionResult<BotCommand>> {
  try {
    const command = await createBotCommand(type, payload);
    revalidatePath('/admin');
    return { success: true, data: command };
  } catch (error: any) {
    console.error(`Error sending command ${type}:`, error);
    return { success: false, error: error.message || 'Failed to dispatch bot command.' };
  }
}

/**
 * Server Action: Get all article drafts
 */
export async function getDraftArticlesAction(status?: string): Promise<DraftArticle[]> {
  try {
    return await getDraftArticles(status);
  } catch (error) {
    console.error('Error fetching draft articles:', error);
    return [];
  }
}

/**
 * Server Action: Get a draft article by UUID
 */
export async function getDraftArticleByIdAction(id: string): Promise<DraftArticle | null> {
  try {
    return await getDraftArticleById(id);
  } catch (error) {
    console.error(`Error fetching draft article ${id}:`, error);
    return null;
  }
}

/**
 * Server Action: Save edits to an article draft
 */
export async function updateDraftArticleAction(
  id: string,
  updates: {
    topic?: string;
    status?: DraftArticle['status'];
    payload?: DraftArticle['payload'];
    error?: string | null;
  }
): Promise<ActionResult<DraftArticle>> {
  try {
    const updated = await updateDraftArticle(id, updates);
    if (!updated) {
      return { success: false, error: 'Draft article not found.' };
    }
    revalidatePath('/admin');
    return { success: true, data: updated };
  } catch (error: any) {
    console.error(`Error updating draft article ${id}:`, error);
    return { success: false, error: error.message || 'Failed to update draft.' };
  }
}

/**
 * Server Action: Get list of recently dispatched commands
 */
export async function getBotCommandsAction(limit = 10): Promise<BotCommand[]> {
  try {
    return await getBotCommands(limit);
  } catch (error) {
    console.error('Error fetching bot commands:', error);
    return [];
  }
}

/**
 * Server Action: Get archive of recently published articles
 */
export async function getRecentArticlesAction(limit = 10): Promise<RecentArticle[]> {
  try {
    return await getRecentArticles(limit);
  } catch (error) {
    console.error('Error fetching recent articles:', error);
    return [];
  }
}
