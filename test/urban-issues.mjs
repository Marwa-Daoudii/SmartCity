import assert from "node:assert/strict";
import { JsonRpcProvider, ContractFactory } from "ethers";
import { abi, bytecode } from "../scripts/compile.mjs";

const provider = new JsonRpcProvider("http://127.0.0.1:8545");

async function confirmed(promise) {
  const tx = await promise;
  const receipt = await tx.wait();
  assert.equal(receipt.status, 1);
}

try {
  const municipal = await provider.getSigner(0);
  const citizen = await provider.getSigner(1);

  // Contrat de test indépendant de celui de l’interface.
  const factory = new ContractFactory(abi, bytecode, municipal);
  const registry = await factory.deploy();
  await registry.waitForDeployment();

  const data = [
    "CITY-2026-TEST",
    "StreetLight",
    "Avenue Mohammed V",
    "Lampadaire en panne",
    "2026-11-20",
    "High",
    "Citizen01",
  ];

  // 1. Un citoyen peut créer un signalement.
  await confirmed(registry.connect(citizen).createIssue(...data));

  const issue = await registry.getIssue(1);
  assert.equal(issue.issueId, data[0]);
  assert.equal(issue.reporter, await citizen.getAddress());
  assert.equal(issue.status, 0n);
  assert.equal(await registry.totalIssues(), 1n);
  console.log("OK 1 - Creation et lecture du signalement");

  // 2. Le même identifiant ne peut pas être réutilisé.
  await assert.rejects(async () => {
    await confirmed(registry.connect(citizen).createIssue(...data));
  });
  assert.equal(await registry.totalIssues(), 1n);
  console.log("OK 2 - Identifiant duplique refuse");

  // 3. Un citoyen ne peut pas affecter une équipe.
  await assert.rejects(async () => {
    await confirmed(
      registry.connect(citizen).assignTeam(
        1, "UrbanTeam01", "Affectation non autorisee"
      )
    );
  });
  assert.equal((await registry.getIssue(1)).status, 0n);
  console.log("OK 3 - Affectation refusee sans autorisation");

  // 4. La municipalité peut affecter une équipe.
  await confirmed(
    registry.assignTeam(
      1, "UrbanTeam01", "Equipe affectee pour intervention"
    )
  );

  const assigned = await registry.getIssue(1);
  assert.equal(assigned.assignedTo, "UrbanTeam01");
  assert.equal(assigned.status, 1n);
  console.log("OK 4 - Affectation par la municipalite");

  // 5. Impossible de passer directement d’Affecté à Fermé.
  await assert.rejects(async () => {
    await confirmed(
      registry.updateStatus(1, 4, "Fermeture prematuree")
    );
  });
  assert.equal((await registry.getIssue(1)).status, 1n);
  console.log("OK 5 - Saut de statut refuse");

  // 6. Un citoyen ne peut pas modifier le statut.
  await assert.rejects(async () => {
    await confirmed(
      registry.connect(citizen).updateStatus(
        1, 2, "Modification non autorisee"
      )
    );
  });
  console.log("OK 6 - Modification refusee sans autorisation");

  // 7. Parcours normal du signalement.
  await confirmed(
    registry.updateStatus(1, 2, "Reparation commencee")
  );
  await confirmed(
    registry.updateStatus(1, 3, "Lampadaire repare")
  );
  await confirmed(
    registry.updateStatus(1, 4, "Intervention verifiee")
  );
  assert.equal((await registry.getIssue(1)).status, 4n);
  console.log("OK 7 - Passage En cours, Resolu puis Ferme");

  // 8. L’historique conserve les cinq étapes et leurs acteurs.
  const history = await registry.getHistory(1);

  assert.equal(history.length, 5);
  assert.deepEqual(
    Array.from(history, (entry) => Number(entry.status)),
    [0, 1, 2, 3, 4]
  );
  assert.equal(history[0].actor, await citizen.getAddress());
  assert.equal(history[1].actor, await municipal.getAddress());
  assert.equal(history[4].comment, "Intervention verifiee");
  console.log("OK 8 - Historique des cinq etapes");

  // 9. Lecture d’un numéro inexistant refusée.
  await assert.rejects(() => registry.getIssue(999));
  console.log("OK 9 - Signalement inexistant refuse");

  console.log("\nTous les tests sont reussis : 9/9.");
} catch (error) {
  console.error("ECHEC :", error);
  process.exitCode = 1;
} finally {
  provider.destroy();
}