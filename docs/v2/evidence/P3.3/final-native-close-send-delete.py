#!/usr/bin/env python3
"""Verification-only helper for the P3.3 final native-close evidence.

Sends the ICCCM ``WM_DELETE_WINDOW`` client message **straight to one window**
over a real X11 connection, with no window manager, no package install and no
forged event or test hook. This is a verification instrument, not application
code: nothing in ``src-tauri/`` imports it and nothing ships it.

Before sending anything it independently asserts, through ``libX11.so.6`` and
its own property reads (never through a tool that might synthesise the answer):

* the window's name is exactly the expected string (``-NET_WM_NAME``, falling
  back to ``WM_NAME``);
* the window's owning pid (``_NET_WM_PID``) is exactly the expected pid;
* the window advertises ``WM_DELETE_WINDOW`` in ``WM_PROTOCOLS`` — the atoms are
  interned by name, never hard-coded, because ICCCM atoms are not predefined.

Only then does it send ``ClientMessage{ type=33, message_type=WM_PROTOCOLS,
format=32, data.l[0]=WM_DELETE_WINDOW, data.l[1]=CurrentTime }`` with
``propagate=False`` and an empty event mask, per ICCCM, and issue ``XSync``
before exiting so the request is on the wire.

Usage:  final-native-close-send-delete.py <window-id> <expected-pid> <expected-name>

Exit codes: 0 sent; 2 bad usage; 3 name mismatch; 4 pid mismatch;
5 WM_DELETE_WINDOW not advertised; 6 XSendEvent refused; 7 Xlib/XOpenDisplay
failure.
"""

import ctypes as C
import sys

EXIT_USAGE = 2
EXIT_NAME = 3
EXIT_PID = 4
EXIT_NOT_ADVERTISED = 5
EXIT_SEND_REFUSED = 6
EXIT_XLIB = 7


def fail(code, message):
    print("FAIL " + message)
    sys.exit(code)


def main(argv):
    if len(argv) != 4:
        fail(EXIT_USAGE, "usage: send-delete.py <window-id> <expected-pid> <expected-name>")
    window = int(argv[1], 0)
    expect_pid = int(argv[2], 0)
    expect_name = argv[3]

    x = C.CDLL("libX11.so.6")
    x.XOpenDisplay.restype = C.c_void_p
    x.XOpenDisplay.argtypes = [C.c_char_p]
    x.XInternAtom.restype = C.c_ulong
    x.XInternAtom.argtypes = [C.c_void_p, C.c_char_p, C.c_int]
    x.XGetWindowProperty.restype = C.c_int
    x.XGetWindowProperty.argtypes = [
        C.c_void_p, C.c_ulong, C.c_ulong, C.c_long, C.c_long, C.c_int, C.c_ulong,
        C.POINTER(C.c_ulong), C.POINTER(C.c_int), C.POINTER(C.c_ulong),
        C.POINTER(C.c_ulong), C.POINTER(C.POINTER(C.c_ubyte)),
    ]
    x.XFree.argtypes = [C.c_void_p]
    x.XSendEvent.restype = C.c_int
    x.XSendEvent.argtypes = [C.c_void_p, C.c_ulong, C.c_int, C.c_long, C.c_void_p]
    x.XSync.argtypes = [C.c_void_p, C.c_int]
    x.XCloseDisplay.argtypes = [C.c_void_p]

    d = x.XOpenDisplay(None)
    if not d:
        fail(EXIT_XLIB, "XOpenDisplay failed for $DISPLAY={}".format(__import__("os").environ.get("DISPLAY", "")))

    def atom(name):
        raw = name if isinstance(name, bytes) else name.encode()
        return x.XInternAtom(d, raw, False)

    def prop_read(name, want_type=0, length=64):
        """Read one window property into (rc, format, raw bytes)."""
        actual_type = C.c_ulong()
        fmt = C.c_int()
        nitems = C.c_ulong()
        after = C.c_ulong()
        data = C.POINTER(C.c_ubyte)()
        rc = x.XGetWindowProperty(
            d, C.c_ulong(window), atom(name), C.c_long(0), C.c_long(length), 0,
            C.c_ulong(want_type),
            C.byref(actual_type), C.byref(fmt), C.byref(nitems),
            C.byref(after), C.byref(data),
        )
        if rc != 0 or not data:
            return rc, fmt.value, b""
        raw = C.string_at(C.cast(data, C.c_void_p), nitems.value * (fmt.value // 8))
        x.XFree(C.cast(data, C.c_void_p))
        return rc, fmt.value, raw

    # ---- 1. the window's own name, exactly ------------------------------------------------
    rc, fmt, raw = prop_read("_NET_WM_NAME")
    if not raw:
        rc, fmt, raw = prop_read("WM_NAME")
    name = raw.decode("utf-8", "replace") if raw else ""
    print("window 0x{:x} name = {!r} (format {})".format(window, name, fmt))
    if name != expect_name:
        fail(EXIT_NAME, "window name is {!r}, expected exactly {!r}".format(name, expect_name))

    # ---- 2. the window's owning pid, exactly ----------------------------------------------
    rc, fmt, raw = prop_read("_NET_WM_PID", want_type=6)  # XA_CARDINAL
    owner = int.from_bytes(raw, "little") if fmt == 32 and raw else -1
    print("window 0x{:x} _NET_WM_PID = {} (format {})".format(window, owner, fmt))
    if owner != expect_pid:
        fail(EXIT_PID, "window is owned by pid {}, expected {}".format(owner, expect_pid))

    # ---- 3. WM_PROTOCOLS really advertises WM_DELETE_WINDOW --------------------------------
    protocols = atom("WM_PROTOCOLS")
    delete_atom = atom("WM_DELETE_WINDOW")
    names = [
        b"WM_DELETE_WINDOW", b"WM_TAKE_FOCUS", b"_NET_WM_PING", b"_NET_WM_SYNC_REQUEST",
        b"_NET_WM_STATE", b"_NET_WM_WINDOW_TYPE", b"_NET_WM_DESKTOP",
    ]
    lookup = {atom(n): n.decode() for n in names}
    rc, fmt, raw = prop_read("WM_PROTOCOLS", want_type=4, length=64)  # XA_ATOM
    atoms = []
    if fmt == 32:
        for i in range(0, len(raw) - 3, 4):
            atoms.append(int.from_bytes(raw[i:i + 4], "little"))
    print("WM_PROTOCOLS on 0x{:x}: rc={} format={} atoms={}".format(
        window, rc, fmt, [(a, lookup.get(a, "?")) for a in atoms]))
    print("WM_DELETE_WINDOW atom = {}; advertised = {}".format(delete_atom, delete_atom in atoms))
    if delete_atom not in atoms:
        fail(EXIT_NOT_ADVERTISED, "the window does not advertise WM_DELETE_WINDOW")

    # ---- 4. the ICCCM close request itself -------------------------------------------------
    class XClientMessageEvent(C.Structure):
        _fields_ = [
            ("type", C.c_int), ("serial", C.c_ulong), ("send_event", C.c_int),
            ("display", C.c_void_p), ("window", C.c_ulong),
            ("message_type", C.c_ulong), ("format", C.c_int), ("data", C.c_long * 5),
        ]

    class XEvent(C.Union):
        _fields_ = [("pad", C.c_long * 24), ("xclient", XClientMessageEvent)]

    ev = XEvent()
    ev.xclient.type = 33            # ClientMessage
    ev.xclient.send_event = 1       # ICCCM: a synthesised event
    ev.xclient.display = d
    ev.xclient.window = window
    ev.xclient.message_type = protocols
    ev.xclient.format = 32
    ev.xclient.data[0] = delete_atom
    ev.xclient.data[1] = 0          # CurrentTime
    # data.l[2..4] stay zero; propagate=False, event_mask=0
    sent = x.XSendEvent(d, C.c_ulong(window), 0, 0, C.byref(ev))
    print("XSendEvent(ClientMessage WM_DELETE_WINDOW) -> {}".format(sent))
    if sent != 1:
        fail(EXIT_SEND_REFUSED, "XSendEvent refused the close request")
    x.XSync(d, 0)                   # on the wire before this process exits
    print("XSync done; close request delivered")
    x.XCloseDisplay(d)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))