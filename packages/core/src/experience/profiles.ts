import type { AdapterProfile } from "../protocol/schemas.js";
import { PraxisBaseError } from "./errors.js";

const BUILT_IN_PROFILES: Record<string, AdapterProfile> = {
  codex: {
    agent: "codex",
    instruction_files: ["AGENTS.md"],
    transcript_paths: ["~/.codex/archived_sessions"],
    raw_artifact_paths: [],
    workspace_markers: ["AGENTS.md", ".git"],
    capture: {
      default_triggers: ["task_finish", "tests_run", "command_complete"],
    },
    context: {
      default_stages: ["diagnosis", "repair", "verification"],
    },
    privacy: {
      redaction_profile: "developer-default",
    },
  },
  "claude-code": {
    agent: "claude-code",
    instruction_files: [".claude/CLAUDE.md", "CLAUDE.md"],
    transcript_paths: ["raw-vault://claude-code/sessions/"],
    raw_artifact_paths: [],
    workspace_markers: [".claude"],
    capture: {
      default_triggers: ["task_finish", "tests_run", "file_edit"],
    },
    context: {
      default_stages: ["diagnosis", "repair", "verification", "proposal"],
    },
    privacy: {
      redaction_profile: "balanced",
    },
  },
  opencode: {
    agent: "opencode",
    instruction_files: [".opencode/instructions.md"],
    transcript_paths: [],
    raw_artifact_paths: ["raw-vault://opencode/transcripts/"],
    workspace_markers: [".opencode"],
    capture: {
      default_triggers: ["task_finish", "tests_run", "tool_use"],
    },
    context: {
      default_stages: ["diagnosis", "repair", "verification"],
    },
    privacy: {
      redaction_profile: "code_focused",
    },
  },
  openclaw: {
    agent: "openclaw",
    instruction_files: [".openclaw/instructions.md"],
    transcript_paths: [],
    raw_artifact_paths: ["raw-vault://openclaw/episodes/", "log://openclaw/"],
    workspace_markers: [".openclaw"],
    capture: {
      default_triggers: ["repair_complete", "repair_failed", "tests_run"],
    },
    context: {
      default_stages: ["diagnosis", "repair", "verification"],
    },
    privacy: {
      redaction_profile: "minimal",
    },
  },
  hermes: {
    agent: "hermes",
    instruction_files: [".hermes/instructions.md"],
    transcript_paths: ["raw-vault://hermes/sessions/"],
    raw_artifact_paths: ["raw-vault://hermes/skills/"],
    workspace_markers: [".hermes"],
    capture: {
      default_triggers: ["skill_update", "memory_update", "curator_patch"],
    },
    context: {
      default_stages: ["diagnosis", "repair", "verification", "proposal"],
    },
    privacy: {
      redaction_profile: "balanced",
    },
  },
  openhuman: {
    agent: "openhuman",
    instruction_files: [".openhuman/preferences.md"],
    transcript_paths: [],
    raw_artifact_paths: ["raw-vault://openhuman/preferences/", "raw-vault://openhuman/persona/"],
    workspace_markers: [".openhuman"],
    capture: {
      default_triggers: ["preference_change", "session_finish"],
    },
    context: {
      default_stages: ["diagnosis", "proposal"],
    },
    privacy: {
      redaction_profile: "strict",
    },
  },
  generic: {
    agent: "generic",
    instruction_files: [],
    transcript_paths: [],
    raw_artifact_paths: ["raw-vault://generic/"],
    workspace_markers: [],
    capture: {
      default_triggers: ["task_finish"],
    },
    context: {
      default_stages: ["diagnosis", "repair", "verification"],
    },
    privacy: {
      redaction_profile: "balanced",
    },
  },
};

export function getAdapterProfile(agent: string): AdapterProfile {
  const profile = BUILT_IN_PROFILES[agent];
  if (!profile) {
    throw new PraxisBaseError(
      "UNKNOWN_ADAPTER_PROFILE",
      `No built-in adapter profile for agent: ${agent}`,
      { agent }
    );
  }
  return profile;
}
