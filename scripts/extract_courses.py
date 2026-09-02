import json
import re
from pathlib import Path

import pandas as pd


SOURCE = Path(__file__).resolve().parents[2] / "2026年秋季学期课表 (3).xlsx"
OUTPUT = Path(__file__).resolve().parents[1] / "app" / "courses.json"


def clean(value):
    if pd.isna(value):
        return ""
    text = str(value).strip()
    return re.sub(r"\.0$", "", text)


def parse_period(text):
    match = re.search(r"周([一二三四五六日天])\s*[（(]\s*(\d+)\s*(?:[-—~～]\s*(\d+))?\s*[)）]", text)
    if not match:
        return {"day": "未排定", "dayIndex": -1, "start": 0, "end": 0}
    day_map = {"一": 0, "二": 1, "三": 2, "四": 3, "五": 4, "六": 5, "日": 6, "天": 6}
    start = int(match.group(2))
    end = int(match.group(3) or match.group(2))
    return {
        "day": "周" + ("日" if match.group(1) == "天" else match.group(1)),
        "dayIndex": day_map[match.group(1)],
        "start": start,
        "end": end,
    }


def parse_weeks(text):
    numbers = []
    for start, end in re.findall(r"(\d+)\s*(?:[-—~～]\s*(\d+))?", text):
        first = int(start)
        last = int(end or start)
        numbers.extend(range(min(first, last), max(first, last) + 1))
    return sorted(set(numbers))


def main():
    frame = pd.read_excel(SOURCE)
    courses = []
    current = None

    for _, row in frame.iterrows():
        if not pd.isna(row["序号"]):
            hours_credit = clean(row["课时/学分"])
            parts = [part.strip() for part in hours_credit.split("/")]
            teachers = [
                clean(row.get("主讲教师")),
                clean(row.get("首席教授")),
                clean(row.get("召集人")),
            ]
            teacher = next((item for item in teachers if item), "待公布")
            current = {
                "id": clean(row["序号"]),
                "code": clean(row["课程编码"]),
                "name": clean(row["课程名称"]),
                "englishName": clean(row["英文名称"]),
                "college": clean(row["开课院系"]) or "未标注院系",
                "category": clean(row["课程属性"]) or "未分类",
                "level": clean(row["培养层次"]) or "未标注",
                "subject": clean(row["所属学科/专业"]) or "未标注",
                "hours": parts[0] if parts else "",
                "credits": float(parts[-1]) if parts and re.fullmatch(r"\d+(?:\.\d+)?", parts[-1]) else 0,
                "capacity": int(row["限选人数"]) if not pd.isna(row["限选人数"]) else 0,
                "enrolled": int(row["已选人数"]) if not pd.isna(row["已选人数"]) else 0,
                "teachingMode": clean(row["授课方式"]) or "未标注",
                "examMode": clean(row["考试方式"]) or "未标注",
                "teacher": teacher,
                "schedules": [],
            }
            courses.append(current)

        if current is None:
            continue

        period_text = clean(row["星期节次"])
        week_text = clean(row["开课周"])
        if period_text:
            period = parse_period(period_text)
            current["schedules"].append(
                {
                    **period,
                    "weeks": parse_weeks(week_text),
                    "weeksText": week_text,
                    "periodText": period_text,
                    "room": clean(row["教室"]) or "教室待定",
                }
            )

    OUTPUT.write_text(
        json.dumps(courses, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"Wrote {len(courses)} courses to {OUTPUT}")


if __name__ == "__main__":
    main()
