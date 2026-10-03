# Read-only squashfs lister used by the P3.5 environment-proposal IR.
#
# The linuxdeploy AppImage is an ELF runtime with a zstd-compressed squashfs
# appended at the end of the ELF (offset = end of the section header table).
# There is no unsquashfs/7z on this host, so this script parses the superblock,
# inode table and directory table directly and shells out to the system `zstd`
# to decompress metadata blocks. It only reads the file.
#
# Usage:
#   python3 squashfs-list.py <linuxdeploy.AppImage>
import struct
import subprocess
import sys

COMPRESS = {1: "gzip", 2: "lzma", 3: "lzo", 4: "xz", 5: "lz4", 6: "zstd"}

path = sys.argv[1]
with open(path, "rb") as fh:
    data = fh.read()

# The squashfs superblock starts where the ELF ends: e_shoff + e_shnum*e_shentsize.
shoff = struct.unpack_from("<Q", data, 0x28)[0]
shentsize = struct.unpack_from("<H", data, 0x3A)[0]
shnum = struct.unpack_from("<H", data, 0x3C)[0]
base = shoff + shentsize * shnum

(
    magic,
    inodes,
    _mkfs,
    bsize,
    _frags,
    comp,
    _blog,
    _flags,
    _no_ids,
    major,
    minor,
) = struct.unpack_from("<IIIIIHHHHHH", data, base)
(root_inode, bytes_used, _id, _xattr, inode_table, dir_table, _frag, _lookup) = struct.unpack_from(
    "<QQQQQQQQ", data, base + 32
)
out = lambda line: sys.stdout.write(line + "\n")
out(f"# squashfs v{major}.{minor} comp={COMPRESS.get(comp, comp)} inodes={inodes} bytes_used={bytes_used}")


def decompress_meta(block_off):
    hdr = struct.unpack_from("<H", data, block_off)[0]
    size = hdr & 0x7FFF
    raw = data[block_off + 2 : block_off + 2 + size]
    if hdr & 0x8000:
        return raw
    if COMPRESS.get(comp) == "zstd":
        return subprocess.run(
            ["zstd", "-d", "-c", "--no-progress"], input=raw, stdout=subprocess.PIPE, check=True
        ).stdout
    raise SystemExit("unsupported compression " + str(comp))


def read_table(table, rel_block, offset, length):
    # Superblock table offsets are relative to the start of the squashfs, which
    # sits at `base` inside the AppImage.
    buf = bytearray()
    blk = base + table + rel_block
    first = True
    while len(buf) < length:
        dec = decompress_meta(blk)
        buf += dec[offset:] if first else dec
        first = False
        hdr = struct.unpack_from("<H", data, blk)[0]
        blk = blk + 2 + (hdr & 0x7FFF)
    return bytes(buf[:length])


def read_inode(ref):
    body = read_table(inode_table, ref >> 16, ref & 0xFFFF, 256)
    return struct.unpack_from("<H", body, 0)[0], body


def walk(ref, prefix):
    itype, body = read_inode(ref)
    if itype not in (1, 8):
        return
    if itype == 1:
        start_block, _nlink, file_size, off, _parent = struct.unpack_from("<IIHHI", body, 16)
    else:
        _nlink, file_size, start_block, _parent = struct.unpack_from("<IIII", body, 16)
        off = struct.unpack_from("<H", body, 34)[0]
    dirdata = read_table(dir_table, start_block, off, file_size)
    pos = 0
    while pos + 12 <= len(dirdata):
        count, sblock, _base = struct.unpack_from("<III", dirdata, pos)
        pos += 12
        for _ in range(count + 1):
            if pos + 8 > len(dirdata):
                break
            eoff, _eino, etype, size = struct.unpack_from("<HHHH", dirdata, pos)
            pos += 8
            name = dirdata[pos : pos + size + 1].decode("utf-8", "replace")
            pos += size + 1
            full = prefix + name
            if etype in (1, 8):
                out("DIR  " + full)
                walk((sblock << 16) | eoff, full + "/")
            else:
                out("FILE " + full)


walk(root_inode, "/")
