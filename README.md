<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SCHOOL PRESENCE</title>
    <style>
      :root {
        --bg: #0f172a;
        --panel: #111827;
        --panel-soft: #1f2937;
        --line: #334155;
        --text: #e5e7eb;
        --muted: #94a3b8;
        --primary: #22c55e;
        --accent: #38bdf8;
        --danger: #f87171;
      }

      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Arial, sans-serif;
        background: linear-gradient(135deg, #0f172a, #1d4ed8);
        color: var(--text);
      }
      .container {
        max-width: 1100px;
        margin: 0 auto;
        padding: 40px 20px;
      }
      .card {
        background: rgba(15, 23, 42, 0.85);
        border: 1px solid rgba(148, 163, 184, 0.3);
        border-radius: 18px;
        padding: 24px;
        box-shadow: 0 20px 40px rgba(0,0,0,0.25);
      }
      h1 {
        margin-top: 0;
        margin-bottom: 10px;
      }
      .subtitle {
        color: var(--muted);
        margin-bottom: 24px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 20px;
      }
      .field {
        display: flex;
        flex-direction: column;
        margin-bottom: 14px;
      }
      label {
        margin-bottom: 6px;
        color: var(--muted);
        font-size: 14px;
      }
      input, button, textarea {
        width: 100%;
        padding: 12px 14px;
        border-radius: 10px;
        border: 1px solid var(--line);
        font-size: 15px;
      }
      input, textarea {
        background: rgba(17, 24, 39, 1);
        color: var(--text);
      }
      button {
        background: var(--primary);
        color: #052e16;
        border: none;
        font-weight: bold;
        cursor: pointer;
        margin-top: 10px;
      }
      .danger {
        background: var(--danger);
        color: #fff;
      }
      textarea {
        min-height: 140px;
        resize: vertical;
      }
      .result {
        margin-top: 24px;
        background: rgba(15, 118, 110, 0.18);
        border: 1px solid rgba(94, 234, 212, 0.4);
        border-radius: 10px;
        padding: 16px;
        white-space: pre-wrap;
      }
      .status {
        margin-top: 12px;
        color: var(--muted);
        font-size: 13px;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="card">
        <h1>SCHOOL PRESENCE</h1>
        <p class="subtitle">Plateforme de gestion intelligente de la vie scolaire</p>

        <div class="grid">
          <div>
            <div class="field">
              <label>Nom de l'établissement</label>
              <input id="schoolName" value="Collège Moderne de Ouagadougou" />
            </div>

            <div class="field">
              <label>Nom de la classe</label>
              <input id="className" value="3A" />
            </div>

            <div class="field">
              <label>Date</label>
              <input id="date" value="2026-11-01" />
            </div>
          </div>

          <div>
            <div class="field">
              <label>Présents</label>
              <input id="present" type="number" value="28" />
            </div>

            <div class="field">
              <label>Absents</label>
              <input id="absent" type="number" value="4" />
            </div>

            <div class="field">
              <label>Retards</label>
              <input id="late" type="number" value="3" />
            </div>

            <div class="field">
              <label>Cas de discipline</label>
              <input id="disciplineCases" type="number" value="2" />
            </div>
          </div>
        </div>

        <button id="generateSummaryBtn">Générer le rapport de présence</button>
        <button id="validateLicenseBtn" class="danger">Valider la licence</button>

        <div class="status" id="status">Prêt</div>

        <div class="result" id="result">
{ "status": "ready", "message": "Le rapport va être généré..." }
        </div>
      </div>
    </div>

    <script>
      const resultBox = document.getElementById('result');
      const statusBox = document.getElementById('status');

      document.getElementById('generateSummaryBtn').addEventListener('click', async () => {
        statusBox.textContent = 'Génération du rapport...';
        const payload = {
          schoolName: document.getElementById('schoolName').value,
          className: document.getElementById('className').value,
          date: document.getElementById('date').value,
          present: Number(document.getElementById('present').value),
          absent: Number(document.getElementById('absent').value),
          late: Number(document.getElementById('late').value),
          disciplineCases: Number(document.getElementById('disciplineCases').value),
        };

        try {
          const res = await fetch('/api/attendance/summary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          const data = await res.json();
          resultBox.textContent = JSON.stringify(data, null, 2);
          statusBox.textContent = 'Rapport généré';
        } catch (error) {
          resultBox.textContent = 'Erreur: ' + error.message;
          statusBox.textContent = 'Erreur';
        }
      });

      document.getElementById('validateLicenseBtn').addEventListener('click', async () => {
        statusBox.textContent = 'Validation de la licence...';

        try {
          const res = await fetch('/api/license/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              key: 'SCHOOL-2025-DEMO',
              schoolName: document.getElementById('schoolName').value,
            }),
          });

          const data = await res.json();
          resultBox.textContent = JSON.stringify(data, null, 2);
          statusBox.textContent = data.valid ? 'Licence valide' : 'Licence invalide';
        } catch (error) {
          resultBox.textContent = 'Erreur: ' + error.message;
          statusBox.textContent = 'Erreur';
        }
      });
    </script>
  </body>
</html>
