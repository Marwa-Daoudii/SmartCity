import React, { useEffect, useState } from "react";
import ImportIssues from "./ImportIssues";
import Municipality from "./Municipality";
import { createRoot } from "react-dom/client";
import {
  BrowserProvider,
  JsonRpcProvider,
  Contract
} from "ethers";

import abi from "./generated/abi.json";
import configuration from "./generated/address.json";
import "./style.css";

const rpc = new JsonRpcProvider("http://127.0.0.1:8545");
const registry = new Contract(configuration.address, abi, rpc);

const statuses = [
  "Reported",
  "Assigned",
  "InProgress",
  "Resolved",
  "Closed"
];

function today() {
  const date = new Date();

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function emptyForm() {
  return {
    issueId: "",
    issueType: "StreetLight",
    location: "",
    description: "",
    reportDate: today(),
    priority: "High",
    reportedBy: "Citizen01"
  };
}

function shortAddress(address) {
  return address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : "Non connecté";
}

function errorMessage(error) {
  return (
    error?.reason ||
    error?.info?.error?.message ||
    error?.error?.message ||
    error?.shortMessage ||
    error?.message ||
    "Une erreur est survenue."
  );
}

function App() {
  const [account, setAccount] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [transactions, setTransactions] = useState([]);

  const [searchId, setSearchId] = useState("");
  const [issue, setIssue] = useState(null);
  const [foundId, setFoundId] = useState("");
  const [searchError, setSearchError] = useState("");
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    function accountChanged(accounts) {
      setAccount(accounts[0] || "");
    }

    function networkChanged() {
      setAccount("");
      setMessage("Réseau changé. Reconnecte MetaMask.");
    }

    window.ethereum?.on("accountsChanged", accountChanged);
    window.ethereum?.on("chainChanged", networkChanged);

    return () => {
      window.ethereum?.removeListener(
        "accountsChanged",
        accountChanged
      );

      window.ethereum?.removeListener(
        "chainChanged",
        networkChanged
      );
    };
  }, []);

  async function correctNetwork() {
    if (!window.ethereum) {
      throw new Error("MetaMask introuvable.");
    }

    const chainId = await window.ethereum.request({
      method: "eth_chainId"
    });

    if (BigInt(chainId) !== 31337n) {
      throw new Error(
        "Sélectionne Hardhat Local dans MetaMask."
      );
    }
  }

  async function connect() {
    setMessage("");

    try {
      await correctNetwork();

      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts"
      });

      setAccount(accounts[0] || "");
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  function updateField(event) {
    const { name, value } = event.target;

    setForm(previous => ({
      ...previous,
      [name]: value
    }));
  }

  async function createIssue(event) {
    event.preventDefault();
    setMessage("");
    setBusy(true);

    let transactionHash = "";

    try {
      await correctNetwork();

      const record = Object.fromEntries(
        Object.entries(form).map(([key, value]) => [
          key,
          value.trim()
        ])
      );

      for (const value of Object.values(record)) {
        if (!value) {
          throw new Error("Remplis tous les champs.");
        }
      }

      const parsedDate = new Date(record.reportDate);

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(record.reportDate) ||
        !Number.isFinite(parsedDate.getTime()) ||
        parsedDate.toISOString().slice(0, 10) !== record.reportDate
      ) {
        throw new Error("La date saisie est invalide.");
      }

      const provider = new BrowserProvider(window.ethereum);

      const code = await provider.getCode(
        configuration.address
      );

      if (code === "0x") {
        throw new Error(
          "Contrat absent. Déploie UrbanIssueRegistry puis recharge la page."
        );
      }

      const signer = await provider.getSigner();
      setAccount(await signer.getAddress());

      const contract = new Contract(
        configuration.address,
        abi,
        signer
      );

      const transaction = await contract.createIssue(
        record.issueId,
        record.issueType,
        record.location,
        record.description,
        record.reportDate,
        record.priority,
        record.reportedBy
      );

      transactionHash = transaction.hash;

      setTransactions(previous => [
        {
          hash: transaction.hash,
          status: "En attente"
        },
        ...previous
      ]);

      setMessage("Transaction envoyée. Confirmation en cours…");

      const receipt = await transaction.wait();

      if (receipt.status !== 1) {
        throw new Error("La transaction a échoué.");
      }

      setTransactions(previous =>
        previous.map(item =>
          item.hash === transaction.hash
            ? { ...item, status: "Confirmée" }
            : item
        )
      );

      const createdEvent = receipt.logs
        .map(log => {
          try {
            return contract.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find(log => log?.name === "IssueCreated");

      if (createdEvent) {
        const id = createdEvent.args.id.toString();

        setMessage(`Signalement enregistré. Numéro : ${id}`);
        setSearchId(id);
      } else {
        setMessage("Signalement enregistré. Transaction confirmée.");
      }

      setForm(emptyForm());
    } catch (error) {
      if (transactionHash) {
        setTransactions(previous =>
          previous.map(item =>
            item.hash === transactionHash
              ? { ...item, status: "À vérifier" }
              : item
          )
        );
      }

      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function searchIssue(event) {
    event.preventDefault();

    setIssue(null);
    setSearchError("");
    setSearching(true);

    try {
      const value = searchId.trim();

      if (!/^[1-9]\d*$/.test(value)) {
        throw new Error(
          "Saisis un numéro positif, par exemple 1."
        );
      }

      const result = await registry.getIssue(BigInt(value));

      setIssue(result);
      setFoundId(value);
    } catch (error) {
      setSearchError(errorMessage(error));
    } finally {
      setSearching(false);
    }
  }

  return (
    <main className="app">
      <header className="header">
        <div>
          <span className="eyebrow">SERVICES URBAINS</span>
          <h1>SmartCity</h1>
          <p>Déclarer un problème et consulter son suivi.</p>
        </div>

        <div className="wallet">
          <span className="network">Hardhat Local</span>

          <button
            type="button"
            onClick={connect}
            disabled={busy}
          >
            {account
              ? shortAddress(account)
              : "Connecter MetaMask"}
          </button>
        </div>
      </header>

      {message && (
        <div className="notice" role="status">
          {message}
        </div>
      )}

      <div className="layout">
        <section className="card">
          <div className="section-heading">
            <span className="step">01</span>
            <div>
              <h2>Nouveau signalement</h2>
              <p>Renseigne les informations du problème.</p>
            </div>
          </div>

          <form onSubmit={createIssue}>
            <div className="form-grid">
              <label>
                Identifiant du signalement
                <input
                  name="issueId"
                  placeholder="CITY-2026-001"
                  value={form.issueId}
                  onChange={updateField}
                  required
                  disabled={busy}
                />
              </label>

              <label>
                Type de problème
                <select
                  name="issueType"
                  value={form.issueType}
                  onChange={updateField}
                  disabled={busy}
                >
                  <option value="StreetLight">Éclairage public</option>
                  <option value="Road">Voirie</option>
                  <option value="Waste">Déchets</option>
                  <option value="Water">Eau</option>
                  <option value="Other">Autre</option>
                </select>
              </label>
            </div>

            <label>
              Localisation
              <input
                name="location"
                placeholder="Avenue Mohammed V"
                value={form.location}
                onChange={updateField}
                required
                disabled={busy}
              />
            </label>

            <label>
              Description
              <textarea
                name="description"
                placeholder="Décris le problème constaté…"
                value={form.description}
                onChange={updateField}
                rows={4}
                required
                disabled={busy}
              />
            </label>

            <div className="form-grid">
              <label>
                Date du signalement
                <input
                  type="date"
                  name="reportDate"
                  value={form.reportDate}
                  onChange={updateField}
                  required
                  disabled={busy}
                />
              </label>

              <label>
                Priorité
                <select
                  name="priority"
                  value={form.priority}
                  onChange={updateField}
                  disabled={busy}
                >
                  <option value="Low">Faible</option>
                  <option value="Medium">Moyenne</option>
                  <option value="High">Élevée</option>
                </select>
              </label>
            </div>

            <label>
              Pseudo fictif du déclarant
              <input
                name="reportedBy"
                placeholder="Citizen01"
                value={form.reportedBy}
                onChange={updateField}
                required
                disabled={busy}
              />
            </label>

            <button
              className="primary full-width"
              disabled={busy}
            >
              {busy ? "Enregistrement…" : "Enregistrer le signalement"}
            </button>
          </form>
        </section>

        <section className="card">
          <div className="section-heading">
            <span className="step">02</span>
            <div>
              <h2>Consulter un signalement</h2>
              <p>Recherche par numéro numérique.</p>
            </div>
          </div>

          <form onSubmit={searchIssue} className="search-form">
            <label>
              Numéro du signalement
              <input
                placeholder="Exemple : 1"
                value={searchId}
                onChange={event => setSearchId(event.target.value)}
                required
              />
            </label>

            <button disabled={searching}>
              {searching ? "Recherche…" : "Rechercher"}
            </button>
          </form>

          {searchError && (
            <p className="error" role="alert">
              {searchError}
            </p>
          )}

          {!issue && !searchError && (
            <div className="empty-state">
              Les informations du signalement apparaîtront ici.
            </div>
          )}

          {issue && (
            <article className="issue-details">
              <div className="issue-title">
                <h3>{issue.issueId}</h3>
                <span className="badge">
                  {statuses[Number(issue.status)]}
                </span>
              </div>

              <dl>
                <dt>Numéro</dt>
                <dd>{foundId}</dd>

                <dt>Type</dt>
                <dd>{issue.issueType}</dd>

                <dt>Localisation</dt>
                <dd>{issue.location}</dd>

                <dt>Description</dt>
                <dd>{issue.description}</dd>

                <dt>Date</dt>
                <dd>{issue.reportDate}</dd>

                <dt>Priorité</dt>
                <dd>{issue.priority}</dd>

                <dt>Déclarant</dt>
                <dd>{issue.reportedBy}</dd>

                <dt>Équipe affectée</dt>
                <dd>{issue.assignedTo || "Non affectée"}</dd>

                <dt>Adresse du déclarant</dt>
                <dd className="hash">{issue.reporter}</dd>
              </dl>
            </article>
          )}
        </section>
      </div>

      <section className="card transactions">
        <h2>Transactions de cette session</h2>

        {transactions.length === 0 ? (
          <p className="muted">Aucune transaction envoyée.</p>
        ) : (
          transactions.map(transaction => (
            <div className="transaction" key={transaction.hash}>
              <span>{transaction.status}</span>
              <code className="hash">{transaction.hash}</code>
            </div>
          ))
        )}
      </section>

      <ImportIssues />
      <Municipality />

      <footer>
        <span>UrbanIssueRegistry</span>
        <span className="hash">{configuration.address}</span>
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);