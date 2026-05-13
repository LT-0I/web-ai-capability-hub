from __future__ import annotations

import argparse
import html
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


SCI_TECH_SUBJECTS = [
    "计算机科学",
    "信息与通信工程",
    "化学",
    "化工",
    "材料科学",
    "航空航天民航",
    "能源",
    "动力工程",
    "光学",
    "数学",
    "物理",
    "土木工程",
    "机械",
    "电子电气",
]

TECH_RESOURCE_TYPES = ["期刊", "会议论文", "学位论文", "图书", "标准", "科技报告", "专利", "整合检索工具"]

GROUP_RULES = [
    ("citation-index", r"Web of Science|Scopus|Ei Village|工程索引|Inspec|CPCI|InCites|ESI"),
    ("computer-communication", r"IEEE|ACM|DBLP|arXiv|IET|IEL|Inspec"),
    ("publisher-fulltext", r"ScienceDirect|Springer|Wiley|Taylor|Francis|Nature|ScienceOnline|SAGE|EBSCO|CUP|Emerald|Annual Reviews"),
    ("chemistry-materials", r"ACS|RSC|ECS|AIP|IOP|APS|Pure and Applied Chemistry|材料|化学"),
    ("aerospace-mechanical-civil", r"AIAA|AHS|ASME|ASCE|SAE|RTCA|ASTM|航空|直升机|机械|土木|标准"),
    ("patent-novelty", r"IncoPat|专利|欧洲专利局|美国专利与商标局"),
    ("open-discovery", r"OpenSign|中国科技论文在线|PubScholar|SCOAP3|INSPIRE|DOAJ|SCIELO|arXiv|DBLP"),
    ("reports-books", r"科技报告|IET|IEL|CRC|Woodhead|科学文库|工程科技数字图书馆|尚唯|电子书|图书"),
]

DISCIPLINE_HINTS = {
    "computer": ["计算机科学", "信息与通信工程", "电子电气"],
    "communication": ["信息与通信工程", "电子电气", "计算机科学"],
    "aerospace": ["航空航天民航", "机械", "能源", "动力工程", "电子电气"],
    "mechanical": ["机械", "能源", "动力工程", "材料科学"],
    "materials": ["材料科学", "化学", "化工", "物理"],
    "chemistry": ["化学", "化工", "材料科学"],
    "energy": ["能源", "动力工程", "材料科学", "机械"],
    "optics": ["光学", "物理", "电子电气", "材料科学"],
    "physics": ["物理", "数学", "光学"],
    "math": ["数学", "物理", "计算机科学"],
    "civil": ["土木工程", "材料科学", "机械"],
    "electronics": ["电子电气", "信息与通信工程", "计算机科学"],
    "patent": SCI_TECH_SUBJECTS,
}

PRIVATE_TEXT_PATTERNS = [
    re.compile("".join(chr(c) for c in [110, 117, 97, 97]), re.I),
    re.compile("".join(chr(c) for c in [0x5357, 0x822A])),
]


def sanitize_public_text(value: Any) -> str:
    text = str(value or "")
    for pattern in PRIVATE_TEXT_PATTERNS:
        text = pattern.sub("institution", text)
    return text


def strip_tags(fragment: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<.*?>", "", fragment))).strip()


def parse_mhtml_table(path: Path) -> list[dict[str, Any]]:
    text = path.read_text(encoding="utf-8", errors="replace")
    rows = re.findall(r"<tr>(.*?)</tr>", text, flags=re.S | re.I)
    records: list[dict[str, Any]] = []
    for index, row in enumerate(rows):
        spans = [strip_tags(s) for s in re.findall(r"<span[^>]*>(.*?)</span>", row, flags=re.S | re.I)]
        spans = [s for s in spans if s]
        if len(spans) < 3 or spans[0] == "标题":
            continue
        title = spans[0]
        subject = spans[-2]
        resource_type = spans[-1]
        records.append(classify_record({"title": title, "subject": subject, "resource_type": resource_type, "source_row": index}))
    return records


def classify_record(record: dict[str, Any]) -> dict[str, Any]:
    title = sanitize_public_text(record.get("title"))
    subject = sanitize_public_text(record.get("subject"))
    resource_type = sanitize_public_text(record.get("resource_type"))
    record["title"] = title
    record["subject"] = subject
    record["resource_type"] = resource_type
    matched_subjects = [s for s in SCI_TECH_SUBJECTS if s in subject]
    matched_types = [t for t in TECH_RESOURCE_TYPES if t in resource_type]
    groups = []
    hay = f"{title} {subject} {resource_type}"
    for group, pattern in GROUP_RULES:
        if re.search(pattern, hay, re.I):
            groups.append(group)
    if not groups and matched_subjects:
        groups.append("specialist-resource")
    engineering_groups = {
        "citation-index",
        "computer-communication",
        "publisher-fulltext",
        "chemistry-materials",
        "aerospace-mechanical-civil",
        "patent-novelty",
        "reports-books",
    }
    record["science_engineering"] = bool(
        matched_subjects
        or any(t in resource_type for t in ["标准", "科技报告", "专利"])
        or any(g in engineering_groups for g in groups)
    )
    record["matched_subjects"] = matched_subjects
    record["matched_resource_types"] = matched_types
    record["workflow_groups"] = sorted(set(groups))
    record["priority"] = priority_score(record)
    return record


def priority_score(record: dict[str, Any]) -> int:
    title = str(record.get("title") or "")
    resource_type = str(record.get("resource_type") or "")
    score = 0
    if record.get("science_engineering"):
        score += 2
    if re.search(r"Web of Science|Scopus|Ei Village|Inspec|IEEE|ACM|ScienceDirect|IncoPat|ASTM|AIAA|ASME|ASCE|SAE", title, re.I):
        score += 4
    if any(t in resource_type for t in ["专利", "标准", "科技报告", "会议论文"]):
        score += 2
    if "整合检索工具" in resource_type:
        score += 1
    return score


def load_records(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        return list(data.get("records") or [])
    return list(data)


def write_json(records: list[dict[str, Any]], out: Path, source: str | None = None) -> None:
    payload = {
        "source": source,
        "record_count": len(records),
        "science_engineering_count": sum(1 for r in records if r.get("science_engineering")),
        "subjects": Counter(s for r in records for s in r.get("matched_subjects", [])).most_common(),
        "workflow_groups": Counter(g for r in records for g in r.get("workflow_groups", [])).most_common(),
        "records": records,
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def write_markdown(records: list[dict[str, Any]], out: Path, only_scitech: bool = True, limit: int | None = None) -> None:
    selected = [r for r in records if (r.get("science_engineering") or not only_scitech)]
    selected.sort(key=lambda r: (-int(r.get("priority") or 0), r.get("title") or ""))
    if limit:
        selected = selected[:limit]
    lines = [
        "# Science and Engineering Digital Resources",
        "",
        f"Records: {len(selected)}",
        "",
        "| Resource | Subject | Type | Workflow group |",
        "|---|---|---|---|",
    ]
    for r in selected:
        lines.append(
            "| {title} | {subject} | {rtype} | {groups} |".format(
                title=str(r.get("title", "")).replace("|", "\\|"),
                subject=str(r.get("subject", "")).replace("|", "\\|"),
                rtype=str(r.get("resource_type", "")).replace("|", "\\|"),
                groups=", ".join(r.get("workflow_groups") or []),
            )
        )
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")


def recommend(records: list[dict[str, Any]], topic: str, discipline: str | None, limit: int) -> list[dict[str, Any]]:
    wanted_subjects = DISCIPLINE_HINTS.get((discipline or "").lower(), [])
    topic_low = topic.lower()
    recs = []
    for record in records:
        if not record.get("science_engineering"):
            continue
        score = int(record.get("priority") or 0)
        groups = set(record.get("workflow_groups") or [])
        if wanted_subjects and any(s in record.get("subject", "") for s in wanted_subjects):
            score += 4
        if discipline and discipline.lower() in {"computer", "communication", "electronics"} and "computer-communication" in groups:
            score += 4
        if discipline and discipline.lower() in {"aerospace", "mechanical", "civil"} and "aerospace-mechanical-civil" in groups:
            score += 4
        if discipline and discipline.lower() in {"materials", "chemistry", "energy", "physics", "optics"} and "chemistry-materials" in groups:
            score += 3
        for token in re.split(r"[\s,;，；/]+", topic_low):
            if token and token in str(record.get("title", "")).lower():
                score += 3
        if "patent" in topic_low or "专利" in topic or "查新" in topic:
            if "patent-novelty" in groups or "专利" in record.get("resource_type", ""):
                score += 6
        if "标准" in topic and "标准" in record.get("resource_type", ""):
            score += 5
        if any(word in topic_low for word in ["review", "survey"]) or "综述" in topic or "调研" in topic:
            if "citation-index" in groups:
                score += 7
            if re.search(r"Annual Reviews|综述", record.get("title", ""), re.I):
                score += 6
            if "publisher-fulltext" in groups:
                score += 2
        item = dict(record)
        item["recommend_score"] = score
        recs.append(item)
    recs.sort(key=lambda r: (-int(r.get("recommend_score") or 0), -int(r.get("priority") or 0), r.get("title") or ""))
    return recs[:limit]


def cmd_parse(args: argparse.Namespace) -> int:
    records = parse_mhtml_table(Path(args.input))
    if args.out_json:
        write_json(records, Path(args.out_json), source=str(Path(args.input).resolve()))
    if args.out_md:
        write_markdown(records, Path(args.out_md), only_scitech=not args.all, limit=args.limit)
    print(json.dumps({"records": len(records), "science_engineering": sum(1 for r in records if r["science_engineering"])}, ensure_ascii=False, indent=2))
    return 0


def cmd_list(args: argparse.Namespace) -> int:
    records = load_records(Path(args.json))
    selected = [r for r in records if not args.scitech or r.get("science_engineering")]
    if args.discipline:
        subjects = DISCIPLINE_HINTS.get(args.discipline.lower(), [args.discipline])
        selected = [r for r in selected if any(s in r.get("subject", "") for s in subjects)]
    if args.resource_type:
        selected = [r for r in selected if args.resource_type in r.get("resource_type", "")]
    selected.sort(key=lambda r: (-int(r.get("priority") or 0), r.get("title") or ""))
    for r in selected[: args.limit]:
        print(f"{r['title']}\t{r['subject']}\t{r['resource_type']}\t{','.join(r.get('workflow_groups') or [])}")
    return 0


def cmd_recommend(args: argparse.Namespace) -> int:
    records = load_records(Path(args.json))
    recs = recommend(records, args.topic, args.discipline, args.limit)
    payload = {"topic": args.topic, "discipline": args.discipline, "recommendations": recs}
    if args.out_json:
        Path(args.out_json).write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if args.out_md:
        lines = [
            "# Recommended Resources",
            "",
            f"Topic: {args.topic}",
            f"Discipline: {args.discipline or 'auto'}",
            "",
            "| Rank | Resource | Why | Subject | Type |",
            "|---:|---|---|---|---|",
        ]
        for idx, r in enumerate(recs, 1):
            why = ", ".join(r.get("workflow_groups") or ["subject match"])
            lines.append(f"| {idx} | {r['title']} | {why} | {r['subject']} | {r['resource_type']} |")
        Path(args.out_md).write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps(payload, indent=2, ensure_ascii=False))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Parse and recommend from digital resource navigation MHTML.")
    sub = parser.add_subparsers(dest="cmd", required=True)
    parse = sub.add_parser("parse")
    parse.add_argument("--input", required=True)
    parse.add_argument("--out-json")
    parse.add_argument("--out-md")
    parse.add_argument("--all", action="store_true", help="Markdown includes all resources, not just science/engineering.")
    parse.add_argument("--limit", type=int)
    parse.set_defaults(func=cmd_parse)
    ls = sub.add_parser("list")
    ls.add_argument("--json", required=True)
    ls.add_argument("--scitech", action="store_true")
    ls.add_argument("--discipline")
    ls.add_argument("--resource-type")
    ls.add_argument("--limit", type=int, default=80)
    ls.set_defaults(func=cmd_list)
    rec = sub.add_parser("recommend")
    rec.add_argument("--json", required=True)
    rec.add_argument("--topic", required=True)
    rec.add_argument("--discipline")
    rec.add_argument("--limit", type=int, default=12)
    rec.add_argument("--out-json")
    rec.add_argument("--out-md")
    rec.set_defaults(func=cmd_recommend)
    return parser


def main(argv: list[str] | None = None) -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
