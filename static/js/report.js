/**
 * Situation Report Viewer & Generation Controller
 */
document.addEventListener('DOMContentLoaded', () => {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const paneEnglish = document.getElementById('pane-english');
    const paneNepali = document.getElementById('pane-nepali');

    const textEnglish = document.getElementById('text-english');
    const textNepali = document.getElementById('text-nepali');
    const btnGenerate = document.getElementById('btn-generate-report');
    const statusBanner = document.getElementById('report-status-banner');

    // Tab Switching
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const lang = btn.dataset.lang;
            if (lang === 'english') {
                paneEnglish.classList.add('active');
                paneNepali.classList.remove('active');
            } else {
                paneNepali.classList.add('active');
                paneEnglish.classList.remove('active');
            }
        });
    });

    function showStatus(message, type = 'info') {
        if (!statusBanner) return;
        statusBanner.style.display = 'block';
        if (type === 'error') {
            statusBanner.style.backgroundColor = '#fef2f2';
            statusBanner.style.color = '#991b1b';
            statusBanner.style.borderColor = '#fecaca';
            statusBanner.innerHTML = `<strong>Notice:</strong> ${message}`;
        } else if (type === 'success') {
            statusBanner.style.backgroundColor = '#f0fdf4';
            statusBanner.style.color = '#166534';
            statusBanner.style.borderColor = '#bbf7d0';
            statusBanner.innerHTML = `<strong>Success:</strong> ${message}`;
        } else {
            statusBanner.style.backgroundColor = '#eff6ff';
            statusBanner.style.color = '#1e40af';
            statusBanner.style.borderColor = '#bfdbfe';
            statusBanner.innerHTML = `${message}`;
        }
    }

    function formatMarkdown(text) {
        if (!text) return '';
        // Escape basic HTML tags to prevent XSS
        let html = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // Headers
        html = html.replace(/^### (.*$)/gim, '<h4 style="margin: 1.1rem 0 0.4rem; font-size: 1.05rem; color: #1e293b; font-weight: 700;">$1</h4>');
        html = html.replace(/^## (.*$)/gim, '<h3 style="margin: 1.3rem 0 0.5rem; font-size: 1.15rem; color: #1e293b; font-weight: 700;">$1</h3>');
        html = html.replace(/^# (.*$)/gim, '<h2 style="margin: 1.5rem 0 0.6rem; font-size: 1.3rem; color: #1e293b; font-weight: 700;">$1</h2>');

        // Bold
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong style="color: #0f172a;">$1</strong>');
        html = html.replace(/__(.*?)__/g, '<strong style="color: #0f172a;">$1</strong>');

        // Italic
        html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

        // Bullet lists
        html = html.replace(/^\s*[-*]\s+(.*$)/gim, '<li style="margin-left: 1.25rem; margin-bottom: 0.35rem;">$1</li>');

        // Numbered lists
        html = html.replace(/^\s*(\d+)\.\s+(.*$)/gim, '<li style="margin-left: 1.25rem; margin-bottom: 0.35rem;"><strong>$1.</strong> $2</li>');

        // Paragraphs & newlines
        html = html.replace(/\n\n+/g, '</p><p style="margin-bottom: 0.85rem; line-height: 1.65;">');
        html = html.replace(/\n/g, '<br/>');

        return `<div class="formatted-report-content" style="line-height: 1.65; color: #334155;"><p style="margin-bottom: 0.85rem; line-height: 1.65;">${html}</p></div>`;
    }

    // Format any initial pre-loaded report text
    if (textEnglish && textEnglish.textContent.trim()) {
        const raw = textEnglish.textContent.trim();
        if (!raw.startsWith('Click "Generate')) {
            textEnglish.innerHTML = formatMarkdown(raw);
        }
    }
    if (textNepali && textNepali.textContent.trim()) {
        const raw = textNepali.textContent.trim();
        if (!raw.startsWith('माथिको "Generate')) {
            textNepali.innerHTML = formatMarkdown(raw);
        }
    }

    // Generate Report Button
    if (btnGenerate && window.JOB_ID) {
        btnGenerate.addEventListener('click', async () => {
            btnGenerate.disabled = true;
            btnGenerate.textContent = "Generating Grounded Report with Gemini...";
            if (statusBanner) statusBanner.style.display = 'none';

            try {
                const resp = await fetch(`/api/analysis/${window.JOB_ID}/report/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });

                const contentType = resp.headers.get('content-type') || '';
                let data = null;
                if (contentType.includes('application/json')) {
                    data = await resp.json();
                } else {
                    const text = await resp.text();
                    throw new Error(`Server returned status ${resp.status}: ${text.slice(0, 100)}`);
                }

                if (!resp.ok) {
                    throw new Error((data && data.detail) || "Report generation failed.");
                }

                if (textEnglish) textEnglish.innerHTML = formatMarkdown(data.report_english || '');
                if (textNepali) textNepali.innerHTML = formatMarkdown(data.report_nepali || '');

                btnGenerate.textContent = "Report Generated Successfully";
                showStatus("Official Disaster Situation Report synthesized successfully grounded in Sentinel satellite radar and optical imagery.", "success");
                setTimeout(() => {
                    btnGenerate.disabled = false;
                    btnGenerate.textContent = "Generate / Refresh AI Briefing (Gemini)";
                }, 3000);
            } catch (e) {
                showStatus(e.message, "error");
                btnGenerate.disabled = false;
                btnGenerate.textContent = "Generate / Refresh AI Briefing (Gemini)";
            }
        });
    }

    // Interactive Rescuer Copilot Q&A Handler
    const copilotForm = document.getElementById('copilot-qa-form');
    const copilotInput = document.getElementById('copilot-qa-input');
    const copilotLog = document.getElementById('copilot-chat-log');
    const btnAsk = document.getElementById('btn-copilot-ask');

    if (copilotForm && window.JOB_ID) {
        copilotForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const question = copilotInput.value.trim();
            if (!question) return;

            // Clear prompt placeholder if first message
            if (copilotLog.querySelector('div[style*="text-align: center"]')) {
                copilotLog.innerHTML = '';
            }

            // Append user question bubble
            const userMsg = document.createElement('div');
            userMsg.style.cssText = "align-self: flex-end; background: #2563eb; color: #fff; padding: 0.5rem 0.85rem; border-radius: 8px 8px 2px 8px; max-width: 80%; font-size: 0.9rem;";
            userMsg.textContent = question;
            copilotLog.appendChild(userMsg);

            copilotInput.value = '';
            btnAsk.disabled = true;
            btnAsk.textContent = "Analyzing query...";

            // Append loading bot bubble
            const botMsg = document.createElement('div');
            botMsg.style.cssText = "align-self: flex-start; background: var(--card-bg, #fff); border: 1px solid var(--border-color, #e2e8f0); color: var(--text-color, #1e293b); padding: 0.6rem 0.85rem; border-radius: 8px 8px 8px 2px; max-width: 85%; font-size: 0.9rem; line-height: 1.4;";
            botMsg.textContent = "Checking satellite measurements...";
            copilotLog.appendChild(botMsg);
            copilotLog.scrollTop = copilotLog.scrollHeight;

            try {
                const resp = await fetch(`/api/analysis/${window.JOB_ID}/copilot-qa/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ question: question })
                });

                if (!resp.ok) {
                    throw new Error("Copilot response error");
                }

                const data = await resp.json();
                botMsg.textContent = data.answer || "No response received.";
            } catch (err) {
                botMsg.textContent = "Could not connect to Mission Copilot. Please try again.";
            } finally {
                btnAsk.disabled = false;
                btnAsk.textContent = "Ask Copilot";
                copilotLog.scrollTop = copilotLog.scrollHeight;
            }
        });
    }
});
