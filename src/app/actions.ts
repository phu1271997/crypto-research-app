'use server';

import { revalidatePath } from 'next/cache';
import { 
  saveProject, 
  getAllProjects, 
  getProjectById, 
  deleteProject, 
  Project,
  createBotCommand,
  getBotCommandById
} from '@/lib/db';
import { scrapeWebsite } from '@/lib/scraper';
import { researchAndScoreProject, cleanAndNormalizeProjectScores, LLMResponse } from '@/lib/openrouter';

/**
 * Server Action result type - avoids throwing errors which get sanitized in production
 */
export type ActionResult<T> = 
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Server Action: Scrape website, run LLM web search/research, score project, and save to DB
 * 
 * Returns a result object instead of throwing errors, because Next.js production builds
 * sanitize error messages from Server Actions, hiding useful details from users.
 * 
 * @param websiteUrl Website URL of the crypto project
 * @param rawInputText Optional additional context pasted by user
 * @returns Result object with either success data or error message
 */
export async function analyzeProjectAction(
  websiteUrl: string, 
  rawInputText = '',
  model?: string
): Promise<ActionResult<Project>> {
  if (!websiteUrl || websiteUrl.trim() === '') {
    return { success: false, error: 'Website URL là bắt buộc.' };
  }

  try {
    // 1. Scrape content from website
    console.log(`Starting server-side scraping for: ${websiteUrl}`);
    const scrapedText = await scrapeWebsite(websiteUrl);

    let normalizedResult: LLMResponse;

    if (model === 'bop') {
      // Bốp (Hermes Agent) Research Flow via DB command queue
      console.log('Dispatching RESEARCH command to Bốp-Worker via database...');
      const command = await createBotCommand('RESEARCH', {
        url: websiteUrl,
        scrapedText: scrapedText,
        rawInput: rawInputText,
        name: 'Dự án'
      });

      console.log(`RESEARCH command dispatched (ID: ${command.id}). Waiting for Bốp-Worker...`);
      let completedCommand = null;
      const startTime = Date.now();
      const timeoutMs = 8 * 60 * 1000; // 8 minutes timeout

      while (Date.now() - startTime < timeoutMs) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const cmd = await getBotCommandById(command.id);
        if (!cmd) {
          throw new Error('Không tìm thấy lệnh nghiên cứu trong database.');
        }
        if (cmd.status === 'done') {
          completedCommand = cmd;
          break;
        }
        if (cmd.status === 'failed') {
          throw new Error(`Bốp research thất bại: ${cmd.error || 'Lỗi không xác định'}`);
        }
      }

      if (!completedCommand) {
        throw new Error('Quá thời gian chờ (Timeout) phản hồi từ Bốp Agent trên VPS.');
      }

      const llmResult = completedCommand.payload.result;
      if (!llmResult) {
        throw new Error('Không nhận được kết quả JSON nghiên cứu từ Bốp.');
      }

      console.log('Successfully retrieved research result from Bốp-Worker. Normalizing scores...');
      normalizedResult = cleanAndNormalizeProjectScores(llmResult);
    } else {
      // Normal OpenRouter Flow
      console.log(`Sending data to OpenRouter (Model: ${model || 'default'})...`);
      const llmResult = await researchAndScoreProject(websiteUrl, scrapedText, rawInputText, model);
      normalizedResult = llmResult;
    }

    // 3. Prepare schema and save to database
    console.log('Saving researched project to Database...');
    const savedProject = await saveProject({
      name: normalizedResult.projectName || 'Dự án ẩn danh',
      website: websiteUrl,
      total_score: normalizedResult.totalScore || 0,
      recommendation: normalizedResult.recommendation || 'Thiếu thông tin khuyến nghị',
      scores: normalizedResult.scores,
      summary: normalizedResult.summary || 'Không có tóm tắt.',
      detailed_assessment: normalizedResult.detailedAssessment || 'Không có đánh giá chi tiết.',
      strengths: normalizedResult.strengths || [],
      risks: normalizedResult.risks || [],
      red_flags: normalizedResult.redFlags || [],
      questions_for_founder: normalizedResult.questionsForFounder || [],
      raw_input: rawInputText || undefined
    });

    console.log(`Analysis complete & saved successfully for: ${savedProject.name} (ID: ${savedProject.id})`);
    
    // Revalidate paths to update Next.js static/dynamic pages
    revalidatePath('/');
    revalidatePath('/list');
    
    return { success: true, data: savedProject };

  } catch (error: any) {
    console.error('Error in analyzeProjectAction:', error);
    const errorMessage = error.message || 'Đã xảy ra lỗi hệ thống trong quá trình phân tích dự án.';
    return { success: false, error: errorMessage };
  }
}

/**
 * Server Action: Fetch all saved projects with search & sorting
 */
export async function getProjectsAction(
  search = '', 
  sortBy: 'score' | 'date' = 'date'
): Promise<Project[]> {
  try {
    return await getAllProjects(search, sortBy);
  } catch (error) {
    console.error('Error in getProjectsAction:', error);
    return [];
  }
}

/**
 * Server Action: Get project detail by UUID
 */
export async function getProjectDetailAction(id: string): Promise<Project | null> {
  try {
    return await getProjectById(id);
  } catch (error) {
    console.error(`Error in getProjectDetailAction for id ${id}:`, error);
    return null;
  }
}

/**
 * Server Action: Delete a project by UUID
 */
export async function deleteProjectAction(id: string): Promise<boolean> {
  try {
    const success = await deleteProject(id);
    if (success) {
      revalidatePath('/list');
    }
    return success;
  } catch (error) {
    console.error(`Error in deleteProjectAction for id ${id}:`, error);
    return false;
  }
}
