import React, { useState } from "react";
import {
  BrowserProvider,
  JsonRpcProvider,
  Contract,
} from "ethers";

import abi from "./generated/abi.json";
import configuration from "./generated/address.json";

const statusLabels = [
  "Déclaré",
  "Affecté",
  "En cours",
  "Résolu",
  "Fermé",
];

export default function Municipality() {
  const [id, setId] = useState("");
  const [team, setTeam] = useState("UrbanTeam01");
  const [comment, setComment] = useState("");
  const [nextStatus, setNextStatus] = useState("2");
  const [entries, setEntries] = useState([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  function validId() {
    const value = id.trim();

    if (!/^[1-9]\d*$/.test(value)) {
      throw new Error("Saisis un numéro de signalement valide.");
    }

    return BigInt(value);
  }

  function displayError(error) {
    return (
      error?.reason ||
      error?.info?.error?.message ||
      error?.shortMessage ||
      error?.message ||
      "Une erreur est survenue."
    );
  }

  async function loadHistory(issueId) {
    const provider = new JsonRpcProvider("http://127.0.0.1:8545");

    try {
      const contract = new Contract(
        configuration.address,
        abi,
        provider
      );

      const result = await contract.getHistory(issueId);
      setEntries(Array.from(result));
    } finally {
      provider.destroy();
    }
  }

  async function showHistory() {
    setBusy(true);
    setMessage("");
    setEntries([]);

    try {
      await loadHistory(validId());
    } catch (error) {
      setMessage(displayError(error));
    } finally {
      setBusy(false);
    }
  }

  async function sendTransaction(action) {
    setBusy(true);
    setMessage("");

    try {
      const issueId = validId();

      if (!comment.trim()) {
        throw new Error("Ajoute un commentaire d’intervention.");
      }

      if (action === "assign" && !team.trim()) {
        throw new Error("Saisis le nom de l’équipe.");
      }

      if (!window.ethereum) {
        throw new Error("Ouvre cette page avec MetaMask installé.");
      }

      const provider = new BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();

      if (network.chainId !== 31337n) {
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

      const municipalAddress = await contract.municipality();
      const selectedAddress = await signer.getAddress();

      if (
        municipalAddress.toLowerCase() !==
        selectedAddress.toLowerCase()
      ) {
        throw new Error(
          "Connecte le compte municipal : " + municipalAddress
        );
      }

      setMessage("Confirme la transaction dans MetaMask.");

      const tx = action === "assign"
        ? await contract.assignTeam(
            issueId,
            team.trim(),
            comment.trim()
          )
        : await contract.updateStatus(
            issueId,
            Number(nextStatus),
            comment.trim()
          );

      setMessage("Transaction envoyée : " + tx.hash);

      const receipt = await tx.wait();

      if (!receipt || receipt.status !== 1) {
        throw new Error("La transaction a échoué.");
      }

      setMessage("Transaction confirmée : " + tx.hash);
      setComment("");
      await loadHistory(issueId);
    } catch (error) {
      setMessage(displayError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Gestion municipale et historique</h2>

      <p>
        Le compte municipal peut affecter une équipe et modifier
        le statut. L’historique est consultable par tous.
      </p>

      <label>
        Numéro du signalement
        <input
          type="number"
          min="1"
          value={id}
          onChange={(event) => {
            setId(event.target.value);
            setEntries([]);
            setMessage("");
          }}
          placeholder="Exemple : 1"
        />
      </label>

      <label>
        Équipe à affecter
        <input
          value={team}
          onChange={(event) => setTeam(event.target.value)}
          placeholder="UrbanTeam01"
        />
      </label>

      <label>
        Commentaire d’intervention
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Décris l’affectation ou l’intervention."
          rows="3"
        />
      </label>

      <button
        type="button"
        disabled={busy}
        onClick={() => sendTransaction("assign")}
      >
        Affecter l’équipe
      </button>

      <label style={{ marginTop: 20 }}>
        Nouveau statut
        <select
          value={nextStatus}
          onChange={(event) => setNextStatus(event.target.value)}
        >
          <option value="2">En cours</option>
          <option value="3">Résolu</option>
          <option value="4">Fermé</option>
        </select>
      </label>

      <p>
        Ordre : Déclaré → Affecté → En cours → Résolu → Fermé.
      </p>

      <button
        type="button"
        disabled={busy}
        onClick={() => sendTransaction("status")}
      >
        Modifier le statut
      </button>

      <hr style={{ margin: "24px 0" }} />

      <button
        type="button"
        disabled={busy}
        onClick={showHistory}
      >
        Consulter l’historique
      </button>

      {message && (
        <p className="notice" role="status" style={{ overflowWrap: "anywhere" }}>
          {message}
        </p>
      )}

      {entries.map((entry, index) => (
        <article
          key={index}
          style={{
            borderTop: "1px solid #dfe6ee",
            marginTop: 16,
            paddingTop: 12,
            overflowWrap: "anywhere",
          }}
        >
          <strong>
            {index + 1}. {statusLabels[Number(entry.status)]}
          </strong>

          <p>
            Date :{" "}
            {new Date(
              Number(entry.timestamp) * 1000
            ).toLocaleString("fr-FR")}
          </p>

          <p>Équipe : {entry.assignedTo || "Non affectée"}</p>
          <p>Commentaire : {entry.comment}</p>
          <p>Acteur : {entry.actor}</p>
        </article>
      ))}
    </section>
  );
}