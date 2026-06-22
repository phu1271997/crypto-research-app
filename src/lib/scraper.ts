import * as cheerio from 'cheerio';

/**
 * Fetches website HTML content and extracts clean, relevant text.
 * Gracefully handles errors and timeouts.
 * 
 * @param url The URL of the crypto project website
 * @returns Clean text extracted from the website
 */
export async function scrapeWebsite(url: string): Promise<string> {
  const targetUrl = url.startsWith('http://') || url.startsWith('https://') 
    ? url 
    : `https://${url}`;

  console.log(`Starting scraper for URL: ${targetUrl}`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
      next: { revalidate: 3600 } // Cache for 1 hour in Next.js
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP status error: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    if (!html || html.trim() === '') {
      throw new Error('Website returned empty HTML');
    }

    // Load html using Cheerio
    const $ = cheerio.load(html);

    // Remove noise elements
    $('script, style, noscript, svg, iframe, header, footer, nav, link, meta, select, button').remove();

        // Get plain text from body (or html if body is missing)
    const bodyContent = $('body').length > 0 ? $('body') : $('html');
    
    // Extract text and clean up whitespace
    let cleanText = bodyContent.text()
      .replace(/\s+/g, ' ') // replace multiple spaces/newlines with a single space
      .trim();

    if (cleanText.length === 0) {
      throw new Error('No readable text found after stripping HTML markup');
    }

    // Cap at a reasonable limit (e.g. 8000 characters)
    const maxChars = 8000;
    if (cleanText.length > maxChars) {
      cleanText = cleanText.substring(0, maxChars) + '... [Nội dung website bị cắt ngắn để tối ưu hóa context]';
    }

    console.log(`Scraper successfully extracted ${cleanText.length} characters from ${targetUrl}`);
    return cleanText;

  } catch (error: any) {
    const errorMsg = error.name === 'AbortError' 
      ? 'Yêu cầu tải trang bị timeout (quá 8 giây)' 
      : error.message || String(error);
      
    console.error(`Scraper error for ${targetUrl}:`, errorMsg);
    
    return `[Lưu ý: Không thể tải nội dung trực tiếp từ website dự án. Lý do: ${errorMsg}. Hệ thống sẽ dựa vào dữ liệu web search của LLM và thông tin bạn cung cấp để chấm điểm.]`;
  }
}
