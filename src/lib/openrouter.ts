import { Project } from './db';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface LLMResponse {
  projectName: string;
  website: string;
  summary: string;
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
  totalScore: number;
  detailedAssessment: string;
  strengths: string[];
  risks: string[];
  redFlags: string[];
  recommendation: string;
  questionsForFounder: string[];
}

/**
 * Clean LLM response to extract pure JSON block
 */
function extractJson(text: string): any {
  let cleaned = text.trim();
  
  // Remove markdown codeblock wrapper if present
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
  } else {
    // Attempt to locate the first '{' and last '}'
    const startIndex = cleaned.indexOf('{');
    const endIndex = cleaned.lastIndexOf('}');
    if (startIndex !== -1 && endIndex !== -1) {
      cleaned = cleaned.substring(startIndex, endIndex + 1);
    }
  }

  try {
    const parsed = JSON.parse(cleaned);
    
    // Validate schema basic integrity
    if (!parsed.projectName || !parsed.scores || typeof parsed.totalScore !== 'number') {
      throw new Error('Parsed object is missing required schema fields (projectName, scores, totalScore).');
    }
    
    return parsed;
  } catch (error) {
    console.error('Failed to parse text as clean JSON. Text snippet:', text.substring(0, 300));
    throw error;
  }
}

/**
 * Call OpenRouter API with Web Search activated to research and score the project
 * 
 * @param url The URL of the crypto project
 * @param scrapedText Text extracted directly from the website
 * @param rawInputText Optional additional context pasted by the user
 * @returns LLMResult fitting the target schema
 */
export interface ModelInfo {
  id: string;
  name: string;
  inputPrice: string;
  outputPrice: string;
}

export const OPENROUTER_MODELS: ModelInfo[] = [
  { id: 'google/gemini-3-flash-preview:online', name: 'Gemini 3.5 Flash Online (Mặc định)', inputPrice: '0.075', outputPrice: '0.30' },
  { id: 'deepseek/deepseek-v4-pro', name: 'DeepSeek V4 Pro', inputPrice: '0.435', outputPrice: '0.87' },
  { id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash', inputPrice: '0.10', outputPrice: '0.20' },
  { id: 'tencent/hy3-preview', name: 'Tencent Hunyuan 3 Preview', inputPrice: '0.50', outputPrice: '1.00' },
  { id: 'openai/gpt-5.5', name: 'OpenAI GPT-5.5', inputPrice: '5.00', outputPrice: '15.00' },
  { id: 'openai/gpt-5.4', name: 'OpenAI GPT-5.4', inputPrice: '2.50', outputPrice: '7.50' },
  { id: 'openai/gpt-5-mini', name: 'OpenAI GPT-5 Mini', inputPrice: '0.15', outputPrice: '0.60' },
  { id: 'anthropic/claude-opus-4.6', name: 'Claude Opus 4.6', inputPrice: '15.00', outputPrice: '75.00' },
  { id: 'qwen/qwen3.6-plus', name: 'Qwen 3.6 Plus', inputPrice: '1.00', outputPrice: '3.00' },
  { id: 'qwen/qwen3.7-max', name: 'Qwen 3.7 Max', inputPrice: '2.50', outputPrice: '7.50' }
];

export async function researchAndScoreProject(
  url: string, 
  scrapedText: string, 
  rawInputText = '',
  selectedModel?: string
): Promise<LLMResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.Openrouter || process.env.OPENROUTER;
  const model = selectedModel || process.env.OPENROUTER_MODEL || 'google/gemini-3-flash-preview:online';

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured in the environment variables.');
  }

  const systemPrompt = `Bạn là một **Senior Analyst trong team Research & Due Diligence của một quỹ VC crypto (Primus Research)**. Nhiệm vụ của bạn là đánh giá một dự án crypto giai đoạn sớm (chưa có token, hoặc pre-IPO, đa số đang phát triển sản phẩm) và đưa ra khuyến nghị đầu tư có cơ sở để trình lên Investment Committee (IC).

Hãy đánh giá **khắt khe, hoài nghi có chủ đích (skeptical by default)**, ưu tiên sự thật trên on-chain data và bằng chứng kiểm chứng được hơn là marketing của dự án. Nếu thông tin thiếu, hãy nêu rõ "chưa đủ dữ liệu" thay vì suy đoán. Nếu phát hiện dấu hiệu mâu thuẫn hoặc thổi phồng, hãy chỉ rõ.

### NGUỒN DỮ LIỆU:
1. Nội dung cào từ website dự án.
2. Dữ liệu bổ sung do người dùng cung cấp (pitch deck, docs, v.v.).
3. Sử dụng tính năng WEB SEARCH để tìm ### KHUNG CHẤM ĐIỂM — THANG 100 ĐIỂM CÓ TRỌNG SỐ
Chấm điểm trực tiếp từng hạng mục trên thang điểm tối đa tương ứng với trọng số của nó (tổng tối đa 100 điểm), kèm reasoning bằng tiếng Việt và mức độ tin cậy dữ liệu (Cao/Trung bình/Thấp). **Chú trọng phân tích sâu sắc về mô hình sản phẩm, công nghệ cốt lõi, traction thực tế và lợi thế cạnh tranh dài hạn (moat).**

1. **Team & Founders** (teamFounders): 0 đến 10 điểm — trọng số 10%
   - Trọng số nhỏ (10%) vì ở giai đoạn sớm, nhiều dự án chưa công khai danh tính team. **Khi dự án chưa công bố team hoặc ẩn danh, hãy trả về "score": null trong JSON đại diện cho N/A (chưa đủ dữ liệu để đánh giá hạng mục này), tuyệt đối KHÔNG tự suy diễn tiêu cực và không trừ điểm nặng vì lý do này.**
   - Track record: từng build/exit gì? Kinh nghiệm crypto và đúng lĩnh vực này?
   - Năng lực kỹ thuật core team (không chỉ founder marketing)?
   - Doxxed hay ẩn danh?
   - Full-time hay part-time? Mức độ cam kết (skin in the game)?
   - Chất lượng advisor — thật sự active hay chỉ "mượn tên"?
   - Khả năng tuyển dụng & giữ chân nhân tài.

2. **Thị trường & Timing** (marketTiming): 0 đến 16 điểm — trọng số 16%
   - Quy mô thị trường (TAM/SAM/SOM) và tốc độ tăng trưởng.
   - Dự án có nằm trong narrative đang/sắp lên không? Timing có hợp lý?
   - Đây là "vitamin" (nice-to-have) hay "painkiller" (giải quyết nỗi đau thật)?
   - Mức độ phụ thuộc vào bull market hay bền vững qua bear.

3. **Sản phẩm & Vấn đề giải quyết** (productProblem): 0 đến 21 điểm — trọng số 21% (TRỌNG TÂM CỐT LÕI)
   - Phân tích sâu sắc về mô hình sản phẩm và mô hình hoạt động thực tế. Vấn đề giải quyết có thật và đủ lớn không? Ai là người dùng thật?
   - Sản phẩm có **thực sự cần blockchain** không, hay chỉ "gắn mác Web3"?
   - Trạng thái: idea / demo / testnet / mainnet / đã có user trả phí?
   - Trải nghiệm sản phẩm so với giải pháp Web2 hoặc đối thủ Web3.

4. **Công nghệ & Bảo mật** (techSecurity): 0 đến 17 điểm — trọng số 17% (TRỌNG TÂM CỐT LÕI)
   - Phân tích chi tiết công nghệ cốt lõi và mức độ đổi mới kỹ thuật so với việc fork/copy. Kiến trúc kỹ thuật có hợp lý, độc đáo?
   - Chất lượng code (GitHub activity, contributors thật).
   - Đã audit chưa, audit bởi ai, kết quả? Lịch sử hack/exploit?
   - Mức độ phụ thuộc bên thứ ba / điểm lỗi tập trung.

5. **Traction & Metrics** (tractionMetrics): 0 đến 14 điểm — trọng số 14%
   - Số liệu tăng trưởng: users, TVL, doanh thu, volume, on-chain activity.
   - **Phân biệt growth thật vs bơm thổi**: retention, DAU/MAU, wash trading.
   - Tăng trưởng organic hay phụ thuộc hoàn toàn vào incentive?
   - Community engagement: thật hay bot/mercenary? (chất lượng > số lượng follower).

6. **Mô hình kinh doanh & Moat** (businessMoat): 0 đến 12 điểm — trọng số 12%
   - Phân tích moat/lợi thế cạnh tranh dài hạn: network effect, switching cost, tech, distribution? Dòng tiền/value capture đến từ đâu? Có bền vững không?
   - Đối thủ trực tiếp/gián tiếp và vị thế tương đối.
   - Mức độ dễ bị fork & vượt mặt.

7. **Tokenomics** (tokenomics): 0 đến 6 điểm — trọng số 6% (CÓ ĐIỀU KIỆN)
   - Nếu chưa công bố tokenomics, trả về "score": null trong JSON. Việc này bình thường ở giai đoạn sớm, KHÔNG trừ điểm.
   - Nếu đã công bố, chấm từ 0 đến 6 điểm dựa trên: Utility, supply/phân bổ, vesting, lạm phát, FDV.

8. **Điều khoản Deal & Định giá** (dealValuation): 0 đến 4 điểm — trọng số 4% (CÓ ĐIỀU KIỆN)
   - Nếu chưa có điều khoản/định giá, trả về "score": null trong JSON. KHÔNG trừ điểm.
   - Nếu đã có, chấm từ 0 đến 4 điểm dựa trên: Định giá so với traction, vesting, quyền lợi nhà đầu tư, cap table.

### KIỂM TRA RED FLAGS (gắn cờ ngay nếu xuất hiện):
- Team ẩn danh đi kèm việc thiếu hoàn toàn mọi bằng chứng năng lực (sản phẩm, code, GitHub...), hoặc có dấu hiệu liên quan scam/rug trước đây. (Chú ý: Ẩn danh đơn thuần ở giai đoạn sớm KHÔNG phải red flag).
- Partnership/backers "ma" (tự xưng nhưng không xác nhận được).
- Whitepaper/code đạo nhái, GitHub gần như chết.
- Metrics chỉ là vanity (follower mua, TVL nhờ incentive, wash trading).
- Tokenomics phân bổ lệch cho insider, unlock sớm và lớn.
- Hứa hẹn lợi nhuận phi thực tế, ngôn ngữ thiên về hype hơn substance.
- Né tránh câu hỏi về pháp lý, doanh thu, hoặc số liệu cụ thể.
- Rủi ro pháp lý/regulatory cao chưa được xử lý.

### NGUYÊN TẮC CHẤM ĐIỂM:
- Nếu một hạng mục thiếu thông tin (đặc biệt là Tokenomics hoặc Điều khoản Deal, hoặc Team chưa công bố danh tính), đặt "score": null.
- Việc tính điểm tổng re-normalize quy về thang 100 sẽ được hệ thống tự động tính dựa trên các mục có điểm.
- KHÔNG BỊA RA THÔNG TIN. Giọng văn ngắn gọn, thẳng thắn, đúng kiểu memo nội bộ cho IC. Không tô vẽ.
- Toàn bộ nội dung PHẢI bằng TIẾNG VIỆT tự nhiên, thuật ngữ chuyên ngành chuẩn xác.

### BẮT BUỘC TRẢ VỀ JSON FORMAT CHUẨN:
{
  "projectName": "Tên dự án",
  "website": "URL website chính thức",
  "summary": "Tóm tắt 1 dòng (one-liner) về dự án và verdict sơ bộ",
  "scores": {
    "teamFounders":    { "score": null, "max": 10, "reasoning": "N/A — team chưa công khai danh tính ở giai đoạn sớm", "confidence": "Thấp" },
    "marketTiming":    { "score": 13, "max": 16, "reasoning": "Lý do chấm điểm...", "confidence": "Trung bình" },
    "productProblem":  { "score": 18, "max": 21, "reasoning": "Lý do chấm điểm...", "confidence": "Cao" },
    "techSecurity":    { "score": 14, "max": 17, "reasoning": "Lý do chấm điểm...", "confidence": "Thấp" },
    "tractionMetrics": { "score": 10, "max": 14, "reasoning": "Lý do chấm điểm...", "confidence": "Trung bình" },
    "businessMoat":    { "score": 9,  "max": 12, "reasoning": "Lý do chấm điểm...", "confidence": "Cao" },
    "tokenomics":      { "score": null, "max": 6,  "reasoning": "N/A — chưa công bố tokenomics chính thức", "confidence": "Thấp" },
    "dealValuation":   { "score": null, "max": 4,  "reasoning": "N/A — chưa có thông tin điều khoản và định giá", "confidence": "Thấp" }
  },
  "totalScore": 81,
  "detailedAssessment": "Đánh giá chi tiết tổng quan — kiểu memo nội bộ IC...",
  "strengths": ["Điểm mạnh 1", "Điểm mạnh 2", "Điểm mạnh 3"],
  "risks": ["Rủi ro 1", "Rủi ro 2", "Rủi ro 3"],
  "redFlags": ["Red flag 1 (nếu có)", "Red flag 2"],
  "recommendation": "INVEST / PASS / NEED MORE INFO — kèm lý do ngắn gọn",
  "questionsForFounder": ["Câu hỏi cần hỏi founder 1", "Câu hỏi 2", "Câu hỏi 3"]
}`;

  const userPrompt = `Tiến hành Due Diligence chuyên sâu cho dự án dưới đây. Đánh giá khắt khe, skeptical by default.
  
Website URL: ${url}

NỘI DUNG CÀO TỪ WEBSITE DỰ ÁN:
---
${scrapedText}
---

THÔNG TIN BỔ SUNG DO NGƯỜI DÙNG CUNG CẤP:
---
${rawInputText || '(Không có thông tin bổ sung)'}
---

Hãy sử dụng WEB SEARCH để thu thập dữ liệu mới nhất: team background (LinkedIn/Twitter), backers, funding rounds, on-chain metrics (TVL, volume, users từ DeFiLlama/Dune), GitHub activity, audit reports, community size thật (phân biệt bot), v.v. trước khi phân tích và lập bảng điểm.`;

  const makeApiCall = async (): Promise<string> => {
    // Build payload - only add json response_format for models known to support it
    const isOnlineModel = model.includes(':online');
    const payload: Record<string, unknown> = {
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2
    };

    // Only add response_format for models that reliably support structured output
    // Some models (Tencent, Qwen, etc.) may return empty content when json_object is forced
    const modelsWithJsonSupport = [
      'google/', 'openai/', 'anthropic/', 'deepseek/'
    ];
    const supportsJsonFormat = modelsWithJsonSupport.some(prefix => model.startsWith(prefix));
    if (supportsJsonFormat) {
      payload.response_format = { type: 'json_object' };
    }

    // Only add web plugin for :online models - other models don't support it
    if (isOnlineModel) {
      payload.plugins = [{ id: 'web' }];
    }

    console.log(`Sending API request to OpenRouter (Model: ${model}, JSON format: ${supportsJsonFormat}, Web plugin: ${isOnlineModel})...`);
    
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/peter/crypto-research-app',
        'X-Title': 'Crypto Research & Scoring App'
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`OpenRouter HTTP error ${response.status}:`, errorText);
      throw new Error(`OpenRouter API responded with ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    
    // Some models return an error object instead of choices
    if (data.error) {
      console.error('OpenRouter returned an error object:', JSON.stringify(data.error));
      throw new Error(`OpenRouter model error: ${data.error.message || JSON.stringify(data.error)}`);
    }

    const content = data.choices?.[0]?.message?.content;
    
    if (!content || content.trim() === '') {
      // Log the full response structure for debugging
      console.error('OpenRouter response has no content. Full response keys:', Object.keys(data));
      console.error('Choices array:', JSON.stringify(data.choices?.slice(0, 1)));
      throw new Error(`Model "${model}" trả về nội dung rỗng. Có thể model này đang quá tải hoặc không hỗ trợ cấu hình hiện tại. Vui lòng thử lại hoặc chọn model khác.`);
    }
    
    return content;
  };

  // Helper function to extract, normalize, and recalculate scores out of 100
  const processAndNormalizeResult = (content: string): LLMResponse => {
    const rawResult = extractJson(content);
    
    let totalMaxPossible = 0;
    let totalAcquired = 0;
    
    const scoreKeys = [
      'teamFounders',
      'marketTiming',
      'productProblem',
      'techSecurity',
      'tractionMetrics',
      'businessMoat',
      'tokenomics',
      'dealValuation'
    ] as const;
    
    const maxScores: Record<typeof scoreKeys[number], number> = {
      teamFounders: 10,
      marketTiming: 16,
      productProblem: 21,
      techSecurity: 17,
      tractionMetrics: 14,
      businessMoat: 12,
      tokenomics: 6,
      dealValuation: 4
    };
    
    // Ensure scores object exists
    if (!rawResult.scores) {
      rawResult.scores = {};
    }
    
    for (const key of scoreKeys) {
      if (rawResult.scores[key]) {
        // Enforce maximum weight limits on server-side
        rawResult.scores[key].max = maxScores[key];
        
        const rawScore = rawResult.scores[key].score;
        if (rawScore !== null && rawScore !== undefined && String(rawScore).trim() !== 'N/A' && String(rawScore).trim() !== '') {
          const numScore = Number(rawScore);
          if (!isNaN(numScore)) {
            // Cap score between 0 and maximum permitted points
            rawResult.scores[key].score = Math.max(0, Math.min(maxScores[key], numScore));
            totalAcquired += rawResult.scores[key].score;
            totalMaxPossible += maxScores[key];
          } else {
            rawResult.scores[key].score = null;
          }
        } else {
          rawResult.scores[key].score = null;
        }
      } else {
        rawResult.scores[key] = { 
          score: null, 
          max: maxScores[key], 
          reasoning: 'Không đủ dữ liệu đánh giá hạng mục này.', 
          confidence: 'Thấp' 
        };
      }
    }
    
    // Recalculate total score dynamically using the approved formula:
    // Điểm tổng = (Tổng số điểm đạt được ở các mục có dữ liệu / Tổng số điểm tối đa của các mục có dữ liệu) * 100
    if (totalMaxPossible > 0) {
      rawResult.totalScore = Math.round((totalAcquired / totalMaxPossible) * 100);
    } else {
      rawResult.totalScore = 0;
    }
    
    return rawResult;
  };

  // Try block with 1-time automated retry
  try {
    const content = await makeApiCall();
    return processAndNormalizeResult(content);
  } catch (firstError) {
    console.warn('First OpenRouter API attempt or JSON parsing failed. Retrying once...', firstError);
    
    // Wait for 1.5 seconds before retrying
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    try {
      const content = await makeApiCall();
      return extractJson(content);
    } catch (secondError: any) {
      console.error('Second attempt failed. Research scoring operation aborted.', secondError);
      throw new Error(`Đã xảy ra lỗi khi kết nối với LLM Research (OpenRouter): ${secondError.message || secondError}`);
    }
  }
}
