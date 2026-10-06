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
                btnGenerate.disabled = false;
                btnGenerate.textContent = "⚡ Generate / Refresh AI Report (Gemini)";
            }
        });
    }
});
