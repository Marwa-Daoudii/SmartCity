// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

contract UrbanIssueRegistry {
    address public municipality;
    uint256 public totalIssues;

    enum Status {
        Reported,
        Assigned,
        InProgress,
        Resolved,
        Closed
    }

    struct Issue {
        string issueId;
        string issueType;
        string location;
        string description;
        string reportDate;
        string priority;
        string reportedBy;
        string assignedTo;
        Status status;
        address reporter;
    }

    struct HistoryEntry {
        uint256 timestamp;
        address actor;
        Status status;
        string assignedTo;
        string comment;
    }

    mapping(uint256 => Issue) private issues;
    mapping(string => bool) public issueIdUsed;
    mapping(uint256 => HistoryEntry[]) private history;

    event IssueCreated(
        uint256 indexed id,
        address indexed reporter,
        string issueId
    );

    event TeamAssigned(
        uint256 indexed id,
        string team,
        address indexed actor
    );

    event StatusUpdated(
        uint256 indexed id,
        Status status,
        address indexed actor
    );

    modifier onlyMunicipality() {
        require(
            msg.sender == municipality,
            "Compte municipal uniquement"
        );
        _;
    }

    constructor() {
        municipality = msg.sender;
    }

    function createIssue(
        string calldata issueId,
        string calldata issueType,
        string calldata location,
        string calldata description,
        string calldata reportDate,
        string calldata priority,
        string calldata reportedBy
    ) external returns (uint256 id) {
        require(bytes(issueId).length > 0, "Identifiant obligatoire");
        require(bytes(issueType).length > 0, "Type obligatoire");
        require(bytes(location).length > 0, "Localisation obligatoire");
        require(bytes(description).length > 0, "Description obligatoire");
        require(bytes(reportDate).length > 0, "Date obligatoire");
        require(bytes(reportedBy).length > 0, "Declarant obligatoire");
        require(!issueIdUsed[issueId], "Identifiant deja utilise");

        require(
            keccak256(bytes(priority)) == keccak256(bytes("Low")) ||
            keccak256(bytes(priority)) == keccak256(bytes("Medium")) ||
            keccak256(bytes(priority)) == keccak256(bytes("High")),
            "Priorite invalide"
        );

        id = ++totalIssues;

        issues[id] = Issue({
            issueId: issueId,
            issueType: issueType,
            location: location,
            description: description,
            reportDate: reportDate,
            priority: priority,
            reportedBy: reportedBy,
            assignedTo: "",
            status: Status.Reported,
            reporter: msg.sender
        });

        issueIdUsed[issueId] = true;

        history[id].push(
            HistoryEntry({
                timestamp: block.timestamp,
                actor: msg.sender,
                status: Status.Reported,
                assignedTo: "",
                comment: "Signalement cree"
            })
        );

        emit IssueCreated(id, msg.sender, issueId);
    }

    function getIssue(uint256 id)
        external
        view
        returns (Issue memory)
    {
        require(id > 0 && id <= totalIssues, "Signalement introuvable");
        return issues[id];
    }

    function assignTeam(
        uint256 id,
        string calldata team,
        string calldata comment
    ) external onlyMunicipality {
        require(id > 0 && id <= totalIssues, "Signalement introuvable");
        require(bytes(team).length > 0, "Equipe obligatoire");
        require(bytes(comment).length > 0, "Commentaire obligatoire");

        Issue storage issue = issues[id];

        require(
            issue.status == Status.Reported,
            "Signalement deja affecte"
        );

        issue.assignedTo = team;
        issue.status = Status.Assigned;

        history[id].push(
            HistoryEntry({
                timestamp: block.timestamp,
                actor: msg.sender,
                status: Status.Assigned,
                assignedTo: team,
                comment: comment
            })
        );

        emit TeamAssigned(id, team, msg.sender);
        emit StatusUpdated(id, Status.Assigned, msg.sender);
    }

    function updateStatus(
        uint256 id,
        Status newStatus,
        string calldata comment
    ) external onlyMunicipality {
        require(id > 0 && id <= totalIssues, "Signalement introuvable");
        require(bytes(comment).length > 0, "Commentaire obligatoire");

        Issue storage issue = issues[id];

        require(
            issue.status != Status.Reported,
            "Affecter une equipe d'abord"
        );
        require(
            issue.status != Status.Closed,
            "Signalement deja ferme"
        );
        require(
            uint256(newStatus) == uint256(issue.status) + 1,
            "Transition de statut invalide"
        );

        issue.status = newStatus;

        history[id].push(
            HistoryEntry({
                timestamp: block.timestamp,
                actor: msg.sender,
                status: newStatus,
                assignedTo: issue.assignedTo,
                comment: comment
            })
        );

        emit StatusUpdated(id, newStatus, msg.sender);
    }

    function getHistory(uint256 id)
        external
        view
        returns (HistoryEntry[] memory)
    {
        require(id > 0 && id <= totalIssues, "Signalement introuvable");
        return history[id];
    }
}