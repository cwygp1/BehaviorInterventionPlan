import { requireAuth, isDemoReq, rejectDemo } from '../../lib/auth';

// 1009(mds/48 #3): 옛 SPA(public/index.html)용 LLM 중계. 인증이 전혀 없고 body.endpoint로 임의 URL에 요청을 보낼 수 있어
//   누구나 서버를 통해 바깥으로 요청을 쏘는 구멍이었다 → 로그인 필수, 체험 계정 차단, endpoint는 서버 환경변수만.
export default requireAuth(async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (isDemoReq(req)) return rejectDemo(res);

  const { messages, model, test } = req.body || {};

  // LM Studio endpoint — 서버 환경변수만(요청 본문의 endpoint는 무시).
  const LLM_URL = process.env.LLM_API_URL || 'http://localhost:1234/v1/chat/completions';

  // Connection test mode — non-streaming, short response
  if (test) {
    try {
      const response = await fetch(LLM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model || 'default',
          messages: [{ role: 'user', content: 'hi' }],
          temperature: 0,
          max_tokens: 10,
          stream: false
        })
      });
      if (response.ok) {
        const data = await response.json();
        return res.status(200).json({ ok: true, model: data.model || 'connected' });
      } else {
        const errorText = await response.text();
        return res.status(response.status).json({ error: `LLM 서버 오류: ${response.status}`, detail: errorText });
      }
    } catch (error) {
      return res.status(502).json({
        error: 'LLM 서버에 연결할 수 없습니다.',
        detail: 'LM Studio가 실행 중인지 확인해주세요. (기본: localhost:1234)'
      });
    }
  }

  // Normal streaming chat mode
  try {
    const response = await fetch(LLM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || 'default',
        messages: messages,
        temperature: 0.7,
        max_tokens: 4096,
        stream: true
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: `LLM 서버 오류: ${response.status}`, detail: errorText });
    }

    // Set up SSE streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        res.write('data: [DONE]\n\n');
        break;
      }
      const chunk = decoder.decode(value, { stream: true });
      // Forward the SSE data as-is
      res.write(chunk);
    }

    res.end();
  } catch (error) {
    console.error('LLM proxy error:', error);
    res.status(502).json({
      error: 'LLM 서버에 연결할 수 없습니다.',
      detail: 'LM Studio가 실행 중인지 확인해주세요. (기본: localhost:1234)',
      message: error.message
    });
  }
});

export const config = {
  api: {
    responseLimit: false
  }
};
