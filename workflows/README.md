# workflows/

> **Reserved for future multi-agent workflow orchestration.**

This directory will contain workflow definitions that chain multiple agents.

## Planned Format

```yaml
# workflows/content-pipeline.yaml
id: content-pipeline
name: Research + Podcast Content Pipeline
steps:
  - agent: stock-analyst
    input:
      stock: "{{ trigger.stock }}"
    output_as: financial_report

  - agent: podcaster-crew
    input:
      topic: "{{ financial_report.stock }} Investment Analysis"
    depends_on: financial_report
```
