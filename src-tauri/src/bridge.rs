//! The wire format the shell and the server share (C-BRIDGE@1).
//!
//! Every line is one JSON object on the child's **stdout**, and the shell reads
//! nothing else on that stream. Only three message types exist today: the
//! `ready` line C-BRIDGE@1 rule 1 fixes verbatim, `fatal{code}` from rule 2, and
//! — for the same channel, so the parser is exercised by more than one shape —
//! `update_request{action}` and `quiesce_result{ok, blockers}`, which P5.4 and
//! P3.4 add.
//!
//! The parsing is hand-written rather than pulled from a crate because A05
//! admits four crates and a JSON library is not one of them. That constraint is
//! also a safety property: the shell reads exactly the fields C-BRIDGE@1 names
//! and ignores everything else, so a line cannot smuggle a field into a
//! decision the contract does not give it.

/// C-BRIDGE@1 rule 1's `protocol`. The shell refuses a line that does not carry
/// it, because a server from another protocol revision is not this server.
pub const PROTOCOL: u64 = 1;

/// The one code C-OWN@1 rule 3's refusal carries.
pub const DATA_FOLDER_IN_USE: &str = "data_folder_in_use";

/// The code for the one other condition: the port was already taken (E5).
pub const PORT_IN_USE: &str = "port_in_use";

/// What the shell learned from one line.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Message {
    /// C-BRIDGE@1 rule 1. `nonce` is the shell's own, echoed back.
    Ready {
        port: u16,
        nonce: String,
        version: String,
        protocol: u64,
    },
    /// C-BRIDGE@1 rule 2 and rule 7. An unrecognised code is carried verbatim
    /// and still shows the error screen.
    Fatal { code: String },
    /// `quiesce_result{ok, blockers[]}` (C-BRIDGE@1 rule 2). Only the boolean is
    /// read: the shell keeps no copy of the blocker vocabulary and never
    /// classifies a blocker (P5.4, fixed decisions).
    QuiesceResult { ok: bool },
    /// `snapshot_result{id, ok, code?}`. `id` is an opaque decimal string,
    /// matched exactly against the request's.
    SnapshotResult {
        id: String,
        ok: bool,
        code: Option<String>,
    },
    /// `update_request{action}`: the server asks the shell to move the updater.
    UpdateRequest { action: UpdateAction },
    /// `setup_request{action}`: the page asked for first-run setup (`setup.rs`).
    SetupRequest { action: SetupAction },
    /// `close_decision{confirm}`: the owner's explicit answer to a refused close.
    CloseDecision { confirm: bool },
    /// `startup_context{mode, updateId?, targetVersion?, previousVersion?}`,
    /// written by the server before `ready`.
    StartupContext {
        mode: StartupMode,
        update_id: Option<String>,
        target_version: Option<String>,
        previous_version: Option<String>,
    },
    /// `health_result{id, ok, code?}`: the acknowledgment of `health_confirm`.
    HealthResult {
        id: String,
        ok: bool,
        code: Option<String>,
    },
    /// `recovery_request{id, action}`: the recovery view asks for a relaunch.
    RecoveryRequest { id: String, action: RecoveryAction },
    /// A message this shell does not act on. Logged and ignored, per rule 2.
    Other { kind: String },
}

/// The `action` of `update_request`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UpdateAction {
    Check,
    Download,
    Install,
}

/// The `action` of `setup_request`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SetupAction {
    Plan,
    Run,
    Cancel,
}

/// The `mode` of `startup_context`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StartupMode {
    Normal,
    Recovery,
}

/// The `action` of `recovery_request`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecoveryAction {
    Restart,
    ReinstallPrevious,
}

/// One line that could not be read at all.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Rejection {
    /// Not JSON, or not an object, or no `type`.
    Unreadable,
    /// A `ready` line whose `protocol` is not this protocol revision.
    WrongProtocol { found: String },
    /// A `ready` line whose `nonce` is not the one this shell generated.
    WrongNonce,
    /// A field of the right name carrying the wrong kind of value.
    Malformed { field: &'static str },
}

/// Parses one line, or says why it could not be used.
///
/// `expected_nonce` is the value the shell put in `APUNTA_SHELL_NONCE`; a
/// `ready` line that does not carry it is rejected here and never reaches the
/// navigation decision, which is what makes "accepts the ready line only if the
/// line's nonce equals it" a property of the parser rather than a habit.
pub fn parse_line(line: &str, expected_nonce: &str) -> Result<Message, Rejection> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return Err(Rejection::Unreadable);
    }
    let Some(kind) = string_field(trimmed, "type") else {
        return Err(Rejection::Unreadable);
    };
    match kind.as_str() {
        "ready" => {
            let Some(protocol_raw) = number_field(trimmed, "protocol") else {
                return Err(Rejection::Malformed { field: "protocol" });
            };
            if protocol_raw != PROTOCOL {
                return Err(Rejection::WrongProtocol {
                    found: protocol_raw.to_string(),
                });
            }
            let Some(nonce) = string_field(trimmed, "nonce") else {
                return Err(Rejection::Malformed { field: "nonce" });
            };
            if nonce != expected_nonce {
                return Err(Rejection::WrongNonce);
            }
            let Some(port_raw) = number_field(trimmed, "port") else {
                return Err(Rejection::Malformed { field: "port" });
            };
            if !(1..=65535).contains(&port_raw) {
                return Err(Rejection::Malformed { field: "port" });
            }
            let Some(version) = string_field(trimmed, "version") else {
                return Err(Rejection::Malformed { field: "version" });
            };
            Ok(Message::Ready {
                port: port_raw as u16,
                nonce,
                version,
                protocol: PROTOCOL,
            })
        }
        "fatal" => {
            let Some(code) = string_field(trimmed, "code") else {
                return Err(Rejection::Malformed { field: "code" });
            };
            if code.is_empty() {
                return Err(Rejection::Malformed { field: "code" });
            }
            // No nonce here, and none is asked for: the line arrives on the
            // trusted stdout of the child this shell spawned (C-BRIDGE@1 rule
            // 1), so the code needs no second proof of origin.
            Ok(Message::Fatal { code })
        }
        "quiesce_result" => {
            let Some(ok) = bool_field(trimmed, "ok") else {
                return Err(Rejection::Malformed { field: "ok" });
            };
            Ok(Message::QuiesceResult { ok })
        }
        "snapshot_result" => {
            let Some(id) = string_field(trimmed, "id") else {
                return Err(Rejection::Malformed { field: "id" });
            };
            let Some(ok) = bool_field(trimmed, "ok") else {
                return Err(Rejection::Malformed { field: "ok" });
            };
            Ok(Message::SnapshotResult {
                id,
                ok,
                code: string_field(trimmed, "code"),
            })
        }
        "update_request" => match string_field(trimmed, "action").as_deref() {
            Some("check") => Ok(Message::UpdateRequest {
                action: UpdateAction::Check,
            }),
            Some("download") => Ok(Message::UpdateRequest {
                action: UpdateAction::Download,
            }),
            Some("install") => Ok(Message::UpdateRequest {
                action: UpdateAction::Install,
            }),
            _ => Err(Rejection::Malformed { field: "action" }),
        },
        "setup_request" => match string_field(trimmed, "action").as_deref() {
            Some("plan") => Ok(Message::SetupRequest {
                action: SetupAction::Plan,
            }),
            Some("run") => Ok(Message::SetupRequest {
                action: SetupAction::Run,
            }),
            Some("cancel") => Ok(Message::SetupRequest {
                action: SetupAction::Cancel,
            }),
            _ => Err(Rejection::Malformed { field: "action" }),
        },
        "close_decision" => {
            let Some(confirm) = bool_field(trimmed, "confirm") else {
                return Err(Rejection::Malformed { field: "confirm" });
            };
            Ok(Message::CloseDecision { confirm })
        }
        "startup_context" => {
            let mode = match string_field(trimmed, "mode").as_deref() {
                Some("normal") => StartupMode::Normal,
                Some("recovery") => StartupMode::Recovery,
                _ => return Err(Rejection::Malformed { field: "mode" }),
            };
            Ok(Message::StartupContext {
                mode,
                update_id: string_field(trimmed, "updateId"),
                target_version: string_field(trimmed, "targetVersion"),
                previous_version: string_field(trimmed, "previousVersion"),
            })
        }
        "health_result" => {
            let Some(id) = string_field(trimmed, "id") else {
                return Err(Rejection::Malformed { field: "id" });
            };
            let Some(ok) = bool_field(trimmed, "ok") else {
                return Err(Rejection::Malformed { field: "ok" });
            };
            Ok(Message::HealthResult {
                id,
                ok,
                code: string_field(trimmed, "code"),
            })
        }
        "recovery_request" => {
            let Some(id) = string_field(trimmed, "id") else {
                return Err(Rejection::Malformed { field: "id" });
            };
            match string_field(trimmed, "action").as_deref() {
                Some("restart") => Ok(Message::RecoveryRequest {
                    id,
                    action: RecoveryAction::Restart,
                }),
                Some("reinstall_previous") => Ok(Message::RecoveryRequest {
                    id,
                    action: RecoveryAction::ReinstallPrevious,
                }),
                _ => Err(Rejection::Malformed { field: "action" }),
            }
        }
        _ => Ok(Message::Other { kind }),
    }
}

/// The bytes of a `shutdown` line, as C-BRIDGE@1 rule 2 spells it.
///
/// Written by the shell to the child's **stdin**; nothing else inbound can stop
/// the server.
pub fn shutdown_line() -> &'static str {
    "{\"type\":\"shutdown\"}\n"
}

/// `quiesce{}`, written to the child's stdin. The same message and the same
/// server entry point as `POST /api/app/quiesce`.
pub fn quiesce_line() -> &'static str {
    "{\"type\":\"quiesce\"}\n"
}

/// `maintenance_release{}`: the only thing that drops maintenance a successful
/// quiesce is holding in shell mode.
pub fn maintenance_release_line() -> &'static str {
    "{\"type\":\"maintenance_release\"}\n"
}

/// `snapshot_request{id}`.
pub fn snapshot_request_line(id: &str) -> String {
    format!(
        "{{\"type\":\"snapshot_request\",\"id\":{}}}\n",
        json_string(id)
    )
}

/// `health_confirm{id}`.
pub fn health_confirm_line(id: &str) -> String {
    format!(
        "{{\"type\":\"health_confirm\",\"id\":{}}}\n",
        json_string(id)
    )
}

/// `update_status{state, version?, code?}`.
pub fn update_status_line(state: &str, version: Option<&str>, code: Option<&str>) -> String {
    let mut line = format!(
        "{{\"type\":\"update_status\",\"state\":{}",
        json_string(state)
    );
    if let Some(version) = version {
        line.push_str(&format!(",\"version\":{}", json_string(version)));
    }
    if let Some(code) = code {
        line.push_str(&format!(",\"code\":{}", json_string(code)));
    }
    line.push_str("}\n");
    line
}

/// Replacement-shell acknowledgment, emitted only after its owned server is ready.
pub fn native_ready_line(nonce: &str, port: u16, version: &str, recovery: bool) -> String {
    format!("{{\"type\":\"ready\",\"nonce\":{},\"port\":{port},\"version\":{},\"protocol\":{PROTOCOL},\"recovery\":{recovery}}}\n", json_string(nonce), json_string(version))
}

/// A JSON string literal, escaping what JSON requires.
pub fn json_string(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');
    for ch in value.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

/// A conservative string-field reader: it finds `"name"` followed by `:` and a
/// quoted value, and unescapes the escapes JSON actually defines. It is not a
/// general parser and does not try to be — it reads the four fields the
/// contract names and gives up otherwise.
fn string_field(line: &str, name: &str) -> Option<String> {
    let needle = format!("\"{name}\"");
    let mut from = 0usize;
    while let Some(offset) = line[from..].find(&needle) {
        let key_at = from + offset;
        from = key_at + needle.len();
        let rest = line[from..].trim_start();
        let Some(after_colon) = rest.strip_prefix(':') else {
            continue;
        };
        let rest = after_colon.trim_start();
        let Some(body) = rest.strip_prefix('"') else {
            continue;
        };
        let mut out = String::new();
        let mut chars = body.chars();
        // An unterminated string simply runs out of characters, and the loop
        // ends without returning: that is "not this field".
        while let Some(ch) = chars.next() {
            match ch {
                '"' => return Some(out),
                '\\' => match chars.next() {
                    Some('"') => out.push('"'),
                    Some('\\') => out.push('\\'),
                    Some('/') => out.push('/'),
                    Some('n') => out.push('\n'),
                    Some('t') => out.push('\t'),
                    Some('r') => out.push('\r'),
                    Some('b') => out.push('\u{8}'),
                    Some('f') => out.push('\u{c}'),
                    Some('u') => {
                        // A code point escape, read as the BMP unit it names.
                        let hex: String = chars.by_ref().take(4).collect();
                        let unit = u32::from_str_radix(&hex, 16).ok()?;
                        out.push(char::from_u32(unit)?);
                    }
                    _ => return None,
                },
                other => out.push(other),
            }
        }
    }
    None
}

/// The same, for an unsigned integer field.
fn number_field(line: &str, name: &str) -> Option<u64> {
    let needle = format!("\"{name}\"");
    let mut from = 0usize;
    while let Some(offset) = line[from..].find(&needle) {
        let key_at = from + offset;
        from = key_at + needle.len();
        let rest = line[from..].trim_start();
        let Some(after_colon) = rest.strip_prefix(':') else {
            continue;
        };
        let digits: String = after_colon
            .trim_start()
            .chars()
            .take_while(char::is_ascii_digit)
            .collect();
        if digits.is_empty() {
            continue;
        }
        return digits.parse().ok();
    }
    None
}

/// The same, for a boolean field.
fn bool_field(line: &str, name: &str) -> Option<bool> {
    let needle = format!("\"{name}\"");
    let mut from = 0usize;
    while let Some(offset) = line[from..].find(&needle) {
        let key_at = from + offset;
        from = key_at + needle.len();
        let rest = line[from..].trim_start();
        let Some(after_colon) = rest.strip_prefix(':') else {
            continue;
        };
        let value = after_colon.trim_start();
        if value.starts_with("true") {
            return Some(true);
        }
        if value.starts_with("false") {
            return Some(false);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    const NONCE: &str = "0f1c9d7a-shell-nonce";

    #[test]
    fn reads_the_ready_line_cbridge_rule_1_fixes() {
        let line = format!(
            r#"{{"type":"ready","port":7831,"nonce":"{NONCE}","version":"1.2.3","protocol":1}}"#
        );
        assert_eq!(
            parse_line(&line, NONCE),
            Ok(Message::Ready {
                port: 7831,
                nonce: NONCE.to_string(),
                version: "1.2.3".to_string(),
                protocol: 1,
            })
        );
    }

    #[test]
    fn field_order_does_not_matter() {
        let line = format!(
            r#"{{"protocol":1,"version":"9","nonce":"{NONCE}","port":7832,"type":"ready"}}"#
        );
        assert!(matches!(
            parse_line(&line, NONCE),
            Ok(Message::Ready { port: 7832, .. })
        ));
    }

    #[test]
    fn a_ready_line_with_another_nonces_nonce_is_refused() {
        let line = r#"{"type":"ready","port":7831,"nonce":"someone-elses","version":"1.2.3","protocol":1}"#;
        assert_eq!(parse_line(line, NONCE), Err(Rejection::WrongNonce));
    }

    #[test]
    fn a_ready_line_without_our_nonce_is_refused() {
        let line = r#"{"type":"ready","port":7831,"version":"1.2.3","protocol":1}"#;
        assert_eq!(
            parse_line(line, NONCE),
            Err(Rejection::Malformed { field: "nonce" })
        );
    }

    #[test]
    fn another_protocol_revision_is_refused_rather_than_navigated_to() {
        let line = format!(
            r#"{{"type":"ready","port":7831,"nonce":"{NONCE}","version":"1.2.3","protocol":2}}"#
        );
        assert_eq!(
            parse_line(&line, NONCE),
            Err(Rejection::WrongProtocol {
                found: "2".to_string()
            })
        );
    }

    #[test]
    fn a_port_outside_the_range_is_malformed() {
        for port in ["0", "70000"] {
            let line = format!(
                r#"{{"type":"ready","port":{port},"nonce":"{NONCE}","version":"1.2.3","protocol":1}}"#
            );
            assert_eq!(
                parse_line(&line, NONCE),
                Err(Rejection::Malformed { field: "port" })
            );
        }
    }

    #[test]
    fn reads_the_two_fixed_codes() {
        assert_eq!(
            parse_line(r#"{"type":"fatal","code":"data_folder_in_use"}"#, NONCE),
            Ok(Message::Fatal {
                code: "data_folder_in_use".to_string()
            })
        );
        assert_eq!(
            parse_line(r#"{"type":"fatal","code":"port_in_use"}"#, NONCE),
            Ok(Message::Fatal {
                code: "port_in_use".to_string()
            })
        );
    }

    #[test]
    fn an_unrecognised_code_is_carried_verbatim_and_not_swallowed() {
        assert_eq!(
            parse_line(r#"{"type":"fatal","code":"a_code_from_the_future"}"#, NONCE),
            Ok(Message::Fatal {
                code: "a_code_from_the_future".to_string()
            })
        );
    }

    #[test]
    fn a_fatal_line_needs_no_nonce() {
        // The line arrives on the trusted stdout of the child this shell
        // spawned, so C-BRIDGE@1 rule 2's shape has no nonce field to add.
        assert!(matches!(
            parse_line(r#"{"type":"fatal","code":"port_in_use"}"#, NONCE),
            Ok(Message::Fatal { .. })
        ));
    }

    #[test]
    fn a_fatal_line_without_a_code_is_malformed() {
        assert_eq!(
            parse_line(r#"{"type":"fatal"}"#, NONCE),
            Err(Rejection::Malformed { field: "code" })
        );
        assert_eq!(
            parse_line(r#"{"type":"fatal","code":""}"#, NONCE),
            Err(Rejection::Malformed { field: "code" })
        );
    }

    #[test]
    fn an_unknown_type_is_reported_rather_than_treated_as_fatal() {
        assert_eq!(
            parse_line(r#"{"type":"something_new","ok":true}"#, NONCE),
            Ok(Message::Other {
                kind: "something_new".to_string()
            })
        );
    }

    #[test]
    fn quiesce_result_reads_only_the_boolean() {
        for (line, expected) in [
            (r#"{"type":"quiesce_result","ok":true,"blockers":[]}"#, true),
            (
                r#"{"type":"quiesce_result","ok":false,"blockers":["recording","unsaved_text","never_heard_of_it"]}"#,
                false,
            ),
        ] {
            assert_eq!(
                parse_line(line, NONCE),
                Ok(Message::QuiesceResult { ok: expected })
            );
        }
        assert_eq!(
            parse_line(r#"{"type":"quiesce_result","blockers":[]}"#, NONCE),
            Err(Rejection::Malformed { field: "ok" })
        );
    }

    #[test]
    fn snapshot_and_health_ids_are_strings_matched_exactly() {
        assert_eq!(
            parse_line(
                r#"{"type":"snapshot_result","id":"0042","ok":false,"code":"snapshot_failed"}"#,
                NONCE
            ),
            Ok(Message::SnapshotResult {
                id: "0042".to_string(),
                ok: false,
                code: Some("snapshot_failed".to_string())
            })
        );
        // A JSON number is not an id.
        assert_eq!(
            parse_line(r#"{"type":"snapshot_result","id":42,"ok":true}"#, NONCE),
            Err(Rejection::Malformed { field: "id" })
        );
        assert_eq!(
            parse_line(r#"{"type":"health_result","id":"7","ok":true}"#, NONCE),
            Ok(Message::HealthResult {
                id: "7".to_string(),
                ok: true,
                code: None
            })
        );
    }

    #[test]
    fn setup_request_parses_its_three_actions_and_refuses_any_other() {
        for (raw, action) in [
            ("plan", SetupAction::Plan),
            ("run", SetupAction::Run),
            ("cancel", SetupAction::Cancel),
        ] {
            assert_eq!(
                parse_line(
                    &format!(r#"{{"type":"setup_request","action":"{raw}"}}"#),
                    NONCE
                ),
                Ok(Message::SetupRequest { action })
            );
        }
        assert_eq!(
            parse_line(r#"{"type":"setup_request","action":"install"}"#, NONCE),
            Err(Rejection::Malformed { field: "action" })
        );
    }

    #[test]
    fn update_request_close_decision_startup_context_and_recovery_request_parse() {
        assert_eq!(
            parse_line(r#"{"type":"update_request","action":"install"}"#, NONCE),
            Ok(Message::UpdateRequest {
                action: UpdateAction::Install
            })
        );
        assert_eq!(
            parse_line(r#"{"type":"update_request","action":"reinstall"}"#, NONCE),
            Err(Rejection::Malformed { field: "action" })
        );
        assert_eq!(
            parse_line(r#"{"type":"close_decision","confirm":false}"#, NONCE),
            Ok(Message::CloseDecision { confirm: false })
        );
        assert_eq!(
            parse_line(
                r#"{"type":"startup_context","mode":"normal","updateId":"9","targetVersion":"1.2.0","previousVersion":"1.1.0"}"#,
                NONCE
            ),
            Ok(Message::StartupContext {
                mode: StartupMode::Normal,
                update_id: Some("9".to_string()),
                target_version: Some("1.2.0".to_string()),
                previous_version: Some("1.1.0".to_string()),
            })
        );
        assert_eq!(
            parse_line(r#"{"type":"startup_context","mode":"recovery"}"#, NONCE),
            Ok(Message::StartupContext {
                mode: StartupMode::Recovery,
                update_id: None,
                target_version: None,
                previous_version: None,
            })
        );
        assert_eq!(
            parse_line(
                r#"{"type":"recovery_request","id":"3","action":"reinstall_previous"}"#,
                NONCE
            ),
            Ok(Message::RecoveryRequest {
                id: "3".to_string(),
                action: RecoveryAction::ReinstallPrevious
            })
        );
    }

    #[test]
    fn outbound_lines_are_the_shapes_the_contract_spells() {
        assert_eq!(quiesce_line(), "{\"type\":\"quiesce\"}\n");
        assert_eq!(
            maintenance_release_line(),
            "{\"type\":\"maintenance_release\"}\n"
        );
        assert_eq!(
            snapshot_request_line("17"),
            "{\"type\":\"snapshot_request\",\"id\":\"17\"}\n"
        );
        assert_eq!(
            health_confirm_line("17"),
            "{\"type\":\"health_confirm\",\"id\":\"17\"}\n"
        );
        assert_eq!(
            update_status_line("idle", None, Some("offline")),
            "{\"type\":\"update_status\",\"state\":\"idle\",\"code\":\"offline\"}\n"
        );
        assert_eq!(
            update_status_line("available", Some("1.2.0"), None),
            "{\"type\":\"update_status\",\"state\":\"available\",\"version\":\"1.2.0\"}\n"
        );
        assert_eq!(json_string("a\"b\\c\n"), "\"a\\\"b\\\\c\\n\"");
    }

    #[test]
    fn unreadable_lines_are_unreadable_not_fatal() {
        for line in [
            "",
            "   ",
            "not json",
            "[1,2]",
            "null",
            "{}",
            r#"{"nope":1}"#,
        ] {
            assert_eq!(
                parse_line(line, NONCE),
                Err(Rejection::Unreadable),
                "{line}"
            );
        }
    }

    #[test]
    fn a_name_inside_a_value_is_not_a_field() {
        // A field name inside another field's value is not a field.
        let line = r#"{"note":"\"type\":\"ready\"","type":"fatal","code":"port_in_use"}"#;
        assert_eq!(
            parse_line(line, NONCE),
            Ok(Message::Fatal {
                code: "port_in_use".to_string()
            })
        );
    }

    #[test]
    fn escaped_characters_are_unescaped() {
        let line = r#"{"type":"fatal","code":"a\"b\\c"}"#;
        assert_eq!(
            parse_line(line, NONCE),
            Ok(Message::Fatal {
                code: "a\"b\\c".to_string()
            })
        );
    }

    #[test]
    fn the_two_codes_are_never_interchanged() {
        // The mapping is one code per condition. Nothing in this parser, and
        // nothing in the shell that reads it, turns one into the other.
        assert_ne!(DATA_FOLDER_IN_USE, PORT_IN_USE);
        for (line, expected) in [
            (
                r#"{"type":"fatal","code":"data_folder_in_use"}"#,
                DATA_FOLDER_IN_USE,
            ),
            (r#"{"type":"fatal","code":"port_in_use"}"#, PORT_IN_USE),
        ] {
            match parse_line(line, NONCE) {
                Ok(Message::Fatal { code }) => assert_eq!(code, expected),
                other => panic!("{line} parsed as {other:?}"),
            }
        }
    }

    #[test]
    fn the_shutdown_line_is_the_shape_cbridge_rule_2_spells() {
        assert_eq!(shutdown_line(), "{\"type\":\"shutdown\"}\n");
        // It is an object with the type the server acts on, so the same parser
        // reads it back as an unknown-to-the-shell inbound action.
        assert_eq!(shutdown_line().trim_end(), r#"{"type":"shutdown"}"#);
    }
}
