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
    /// A message this shell does not act on. Logged and ignored, per rule 2.
    Other { kind: String },
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
            parse_line(
                r#"{"type":"quiesce_result","ok":true,"blockers":[]}"#,
                NONCE
            ),
            Ok(Message::Other {
                kind: "quiesce_result".to_string()
            })
        );
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
