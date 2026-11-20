import React, { useState } from "react";
import { BrowserProvider, Contract } from "ethers";
import abi from "./generated/abi.json";
import configuration from "./generated/address.json";
import * as XLSX from "xlsx";

const columns = [
  "issueId",
  "issueType",
  "location",
  "description",
  "reportDate",
  "priority",
  "reportedBy",
  "assignedTo",
  "status",
];

const statuses = [
  "Reported",
  "Assigned",
  "InProgress",
  "Resolved",
  "Closed",
];

function normalizeDate(value) {
  // Une date Excel peut être stockée comme un nombre.
  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value);

    if (!date) return "";

    return [
      date.y,
      String(date.m).padStart(2, "0"),
      String(date.d).padStart(2, "0"),
    ].join("-");
  }

  return String(value ?? "").trim();
}

function validate(row) {
  const required = [
    "issueId",
    "issueType",
    "location",
    "description",
    "reportDate",
    "priority",
    "reportedBy",
    "status",
  ];

  for (const field of required) {
    if (!row[field]) return `Champ obligatoire : ${field}`;
  }

  if (!["Low", "Medium", "High"].includes(row.priority)) {
    return "Priorité attendue : Low, Medium ou High";
  }

  if (!statuses.includes(row.status)) {
    return "Statut invalide";
  }

  if (row.status !== "Reported" && !row.assignedTo) {
    return "Une équipe est obligatoire pour ce statut";
  }

  const date = new Date(`${row.reportDate}T00:00:00Z`);

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(row.reportDate) ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== row.reportDate
  ) {
    return "Date attendue : AAAA-MM-JJ";
  }

  return "";
}

export default function ImportIssues() {
  const [rows, setRows] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  async function readFile(event) {
    const file = event.target.files?.[0];

    setRows([]);
    setMessage("");

    if (!file) return;

    setLoading(true);

    try {
      const buffer = await file.arrayBuffer();

      const workbook = XLSX.read(buffer, {
        type: "array",
        raw: true,
        cellDates: false,
      });

      const sheet = workbook.Sheets[workbook.SheetNames[0]];

      if (!sheet) {
        throw new Error("Le fichier ne contient aucune feuille.");
      }

      const matrix = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
        blankrows: false,
      });

      if (matrix.length < 2) {
        throw new Error("Le fichier ne contient aucune donnée.");
      }

      const headers = matrix[0].map((value) =>
        String(value).trim()
      );

      const missing = columns.filter(
        (column) => !headers.includes(column)
      );

      if (missing.length) {
        throw new Error(
          "Colonnes manquantes : " + missing.join(", ")
        );
      }

      for (const column of columns) {
        if (headers.filter((header) => header === column).length > 1) {
          throw new Error("Colonne répétée : " + column);
        }
      }

      const parsed = matrix.slice(1).map((values) => {
        const row = {};

        for (const column of columns) {
          const value = values[headers.indexOf(column)];

          row[column] = column === "reportDate"
            ? normalizeDate(value)
            : String(value ?? "").trim();
        }

        return row;
      });

      const counts = new Map();

      for (const row of parsed) {
        counts.set(
          row.issueId,
          (counts.get(row.issueId) || 0) + 1
        );
      }

      const checked = parsed.map((row) => {
        const error = validate(row) ||
          (counts.get(row.issueId) > 1
            ? "Identifiant répété dans le fichier"
            : "");

        return {
          ...row,
          error,
          selected: !error,
        };
      });

      setRows(checked);

      const validCount = checked.filter(
        (row) => !row.error
      ).length;

      setMessage(
        `${checked.length} ligne(s) lue(s), ` +
        `${validCount} valide(s). ` +
        "Aucun enregistrement blockchain effectué."
      );
    } catch (error) {
      setMessage(error.message || "Lecture impossible.");
    } finally {
      setLoading(false);
    }
  }
  async function registerSelected() {
  const selected = rows
    .map((row, index) => ({ ...row, index }))
    .filter((row) => row.selected && !row.error);

  if (!selected.length) {
    setMessage("Sélectionne au moins une ligne valide.");
    return;
  }

  // Les affectations et changements de statut se font ensuite
  // dans le bloc Gestion municipale.
  if (selected.some(
    (row) => row.status !== "Reported" || row.assignedTo
  )) {
    setMessage(
      "Pour cet import, utilise le statut Reported et laisse " +
      "assignedTo vide. Affecte ensuite les équipes dans Gestion municipale."
    );
    return;
  }

  setSending(true);
  setMessage("");

  try {
    if (!window.ethereum) {
      throw new Error("MetaMask est nécessaire.");
    }

    const provider = new BrowserProvider(window.ethereum);

    if ((await provider.getNetwork()).chainId !== 31337n) {
      throw new Error("Sélectionne Hardhat Local dans MetaMask.");
    }

    await provider.send("eth_requestAccounts", []);

    if (await provider.getCode(configuration.address) === "0x") {
      throw new Error("Contrat absent. Relance le déploiement.");
    }

    const signer = await provider.getSigner();
    const contract = new Contract(
      configuration.address,
      abi,
      signer
    );

    // Vérifier les doublons avant de commencer les transactions.
    for (const row of selected) {
      if (await contract.issueIdUsed(row.issueId)) {
        throw new Error(
          "Identifiant déjà enregistré : " + row.issueId
        );
      }
    }

    let completed = 0;

    for (const row of selected) {
      setMessage(
        `Confirme dans MetaMask : ${row.issueId} ` +
        `(${completed + 1}/${selected.length})`
      );

      const tx = await contract.createIssue(
        row.issueId,
        row.issueType,
        row.location,
        row.description,
        row.reportDate,
        row.priority,
        row.reportedBy
      );

      // Une transaction envoyée doit être vérifiée avant toute relance.
      setRows((previous) =>
        previous.map((item, index) =>
          index === row.index
            ? {
                ...item,
                selected: false,
                result: "Envoyée : " + tx.hash,
              }
            : item
        )
      );

      const receipt = await tx.wait();

      if (!receipt || receipt.status !== 1) {
        throw new Error(
          "Transaction échouée pour " + row.issueId
        );
      }

      completed++;

      setRows((previous) =>
        previous.map((item, index) =>
          index === row.index
            ? {
                ...item,
                result: "Confirmée : " + tx.hash,
              }
            : item
        )
      );
    }

    setMessage(
      `${completed} signalement(s) enregistré(s). ` +
      "Tu peux maintenant les rechercher par numéro."
    );
  } catch (error) {
    const detail =
      error?.reason ||
      error?.info?.error?.message ||
      error?.shortMessage ||
      error?.message;

    setMessage(
      "Import arrêté : " + detail +
      ". Les transactions déjà confirmées restent enregistrées. " +
      "Vérifie toute transaction envoyée avant de la relancer."
    );
  } finally {
    setSending(false);
  }
}

  function toggleRow(index) {
    setRows((previous) =>
      previous.map((row, position) =>
        position === index && !row.error
          ? { ...row, selected: !row.selected }
          : row
      )
    );
  }

  return (
    <section className="card" style={{ marginTop: 24 }}>
      <h2>Importer des signalements Excel ou CSV</h2>

      <p>
        Choisis un fichier pour vérifier les données et
        sélectionner les lignes.
      </p>

      <input
        type="file"
        accept=".xlsx,.xls,.csv"
       disabled={loading || sending}
        onChange={readFile}
      />

      {message && <p role="status">{message}</p>}

      {rows.length > 0 && (
        <>
          <div style={{ overflowX: "auto", marginTop: 20 }}>
            <table className="import-table">
              <thead>
                <tr>
                  <th>Choix</th>
                  {columns.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                  <th>Validation</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row, index) => (
                  <tr key={index}>
                    <td>
                      <input
                        type="checkbox"
                        checked={row.selected}
                        disabled={sending || Boolean(row.error) || Boolean(row.result)}
                        onChange={() => toggleRow(index)}
                        aria-label={`Sélectionner la ligne ${index + 1}`}
                      />
                    </td>

                    {columns.map((column) => (
                      <td key={column}>{row[column] || "—"}</td>
                    ))}

                    <td style={{ overflowWrap: "anywhere", maxWidth: 250 }}>
                        {row.error || row.result || "Prêt"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p>
            Lignes sélectionnées :{" "}
            {rows.filter((row) => row.selected).length}
          </p>
          <button
  type="button"
  disabled={sending || !rows.some((row) => row.selected)}
  onClick={registerSelected}
>
  {sending
    ? "Enregistrement en cours…"
    : "Enregistrer les lignes sélectionnées"}
</button>
        </>
      )}
    </section>
  );
}