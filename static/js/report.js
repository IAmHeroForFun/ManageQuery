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

    // Generate Report Button
    if (btnGenerate && window.JOB_ID) {
        btnGenerate.addEventListener('click', async () => {
            btnGenerate.disabled = true;
            btnGenerate.textContent = "⏳ Generating Grounded Report with Gemini...";

            try {
                const resp = await fetch(`/api/analysis/${window.JOB_ID}/report/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });

                if (!resp.ok) {
                    const err = await resp.json();
                    throw new Error(err.detail || "Report generation failed.");
                }

                const data = await resp.json();
                if (textEnglish) textEnglish.textContent = data.report_english || '';
                if (textNepali) textNepali.textContent = data.report_nepali || '';

                btnGenerate.textContent = "✅ Report Generated Successfully";
                setTimeout(() => {
                    btnGenerate.disabled = false;
                    btnGenerate.textContent = "⚡ Generate / Refresh AI Report (Gemini)";
                }, 3000);
            } catch (e) {
                alert("Could not generate report: " + e.message);
                btnGenerate.textContent = "⚡ Generate / Refresh AI Report (Gemini)";
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
            btnAsk.textContent = "⏳ Thinking...";

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
                botMsg.textContent = "⚠️ Could not connect to Mission Copilot. Please try again.";
            } finally {
                btnAsk.disabled = false;
                btnAsk.textContent = "💬 Ask Copilot";
                copilotLog.scrollTop = copilotLog.scrollHeight;
            }
        });
    }
});
