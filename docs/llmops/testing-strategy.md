# LLMOps — Evaluation, Observability, and Quality

_A practical knowledge base for testing, evaluating, and operating Large Language Models_

---

## 1. Why LLM Evaluation Is Different

LLMs are **non-deterministic**, **context-sensitive**, and **probabilistic** systems. Traditional "exact output" testing is insufficient.

Key challenges:
- Multiple valid outputs for the same input
- Output quality spans correctness, relevance, safety, coherence, and style
- Behaviour can drift due to model updates, prompt changes, or data distribution shifts
- Errors are often *plausible*, not obviously wrong

Therefore, LLM evaluation must be:
- **Multi-dimensional**
- **Continuous**
- **Observable**
- **Automated + human-in-the-loop**

---

## 2. Core Evaluation Pillars

### 2.1 Dimensions of Quality

LLM outputs should be evaluated across **multiple dimensions**, not a single score.

| Dimension | What it Measures |
|---------|------------------|
| Accuracy | Factual correctness vs ground truth |
| Relevance | Does the response address the user's intent? |
| Coherence | Logical structure, clarity, consistency |
| Completeness | Are key points covered? |
| Instruction Adherence | Follows system + user instructions |
| Safety | Avoids harmful, biased, or disallowed content |
| Robustness | Resistance to adversarial or edge-case prompts |
| Latency | Time to produce output |
| Cost | Token usage and inference cost |

> Improving one dimension may degrade another (e.g. verbosity increases completeness but reduces relevance).

---

## 3. Types of LLM Evaluation

### 3.1 Automated Evaluation

Used for **scale, regression, and CI/CD gating**.

**Common Metrics**
- BLEU / ROUGE — lexical overlap (summarisation, translation)
- Semantic similarity (embeddings, cosine similarity)
- Hallucination detection heuristics
- Structural validity (JSON schema, required fields)
- Toxicity / policy classifiers

**Limitations**
- Lexical metrics can miss semantic correctness
- Cannot fully judge usefulness or intent satisfaction

---

### 3.2 Model-as-Judge Evaluation (LLM-Judge)

An LLM evaluates another LLM's output using **explicit rubric criteria**.

Typical rubric dimensions:
- Accuracy
- Relevance
- Coherence
- Clarity
- Instruction adherence
- Safety

Benefits:
- Scalable
- Consistent scoring
- Captures subjective qualities better than lexical metrics

Risks:
- Judge bias
- Drift if judge model changes
- Must calibrate against human benchmarks

> Treat the judge model itself as a **testable component**.

---

### 3.3 Human Evaluation

Used when:
- Stakes are high
- Output quality is subjective or domain-specific
- Safety or ethics are involved

Techniques:
- Expert review
- Crowd annotation
- Pairwise ranking
- Pass / fail rubric scoring

Best practice:
- Combine human judgment with automated signals
- Use humans to **create gold datasets** and **validate judges**

---

## 4. Designing Evaluation Datasets

### 4.1 Ground Truth Definition

Ground truth must be **explicitly defined** per task:
- What is "correct"?
- Are multiple answers acceptable?
- What errors are unacceptable?

Avoid:
- Implicit assumptions
- Vague rubrics
- Single-reference answers when multiple are valid

---

### 4.2 Representative Data

Evaluation datasets should:
- Reflect **real production usage**
- Include noisy, incomplete, ambiguous inputs
- Cover edge cases and failure modes
- Include adversarial prompts

Do NOT rely on:
- Idealised or synthetic-only examples
- Happy-path inputs

---

### 4.3 Multi-Reference Answers

When possible:
- Provide multiple acceptable outputs
- Avoid penalising valid paraphrases
- Prefer semantic equivalence over exact matching

---

## 5. Regression Testing for LLMs

### 5.1 Snapshot (Golden Set) Testing

A fixed set of trusted prompts and expected behaviours:

```yaml
test_id: clinical-summary-002
prompt: "Summarise this patient report"
criteria:
  - accuracy: true
  - hallucinations: none
  - structure: valid_json
  - safety: compliant
```

Used to:
- Detect regressions early
- Compare model or prompt versions
- Gate production releases

---

### 5.2 Property-Based Testing

Validate behavioural properties, not exact outputs.

Examples:
- Output must always be valid JSON
- No PII leakage
- Always refuse disallowed requests
- Always cite sources when required

This is critical due to LLM non-determinism.

---

## 6. Observability for LLM Systems

### 6.1 What Must Be Observed

For every request:
- Final resolved prompt (system + user + retrieved context)
- Model version
- Parameters (temperature, max tokens, etc.)
- Response content (or hashed/summarised)
- Latency breakdown:
  - Prompt construction
  - Retrieval
  - Inference
  - Post-processing
- Token usage:
  - Input tokens
  - Output tokens
- Cost attribution
- Error or refusal signals

---

### 6.2 Prompt and Context Logging

Why:
- Most failures originate in prompt construction or context retrieval
- Enables reproducibility and debugging

Key rules:
- Log what the model actually saw
- Hash or redact sensitive data
- Never log raw secrets or PII

---

## 7. Cost, Token, and Latency Metrics

### 7.1 Token Metrics

- Input tokens
- Output tokens
- Tokens from retrieval / augmentation
- Total tokens per request

Used to:
- Detect prompt bloat
- Control runaway costs
- Compare prompt strategies

---

### 7.2 Latency Metrics

- Retrieval latency
- Inference latency
- End-to-end response time

Why it matters:
- Users perceive latency more than accuracy
- Latency regressions often go unnoticed without monitoring

---

## 8. Logging Strategy and Schema Design

### 8.1 Minimal Structured Logging

Log only what is necessary:
- Request ID
- Timestamp
- Model name / version
- Prompt hash
- Evaluation metrics
- Latency
- Token counts

Benefits:
- Lower cost
- Easier analysis
- Stronger privacy guarantees

---

### 8.2 Sampling Strategies

- **Random sampling** — cheap, broad coverage
- **Stratified sampling** — ensure key segments are covered
- **Adaptive sampling** — increase logging when anomalies detected

Avoid logging everything in production.

---

## 9. Safety and Compliance Evaluation

Safety is a first-class quality dimension, not a side check.

Evaluate:
- Policy compliance
- Refusal correctness
- PII leakage
- Toxic or biased content
- Instruction hierarchy adherence

Best practice:
- Separate safety scores from quality scores
- Do not allow good task performance to mask safety failures

---

## 10. Continuous Evaluation Pipelines

Continuous evaluation should run:
- On every code change
- On prompt updates
- On model version updates
- On embedding or retrieval changes
- On scheduled intervals (drift detection)

Pipeline stages:
1. Run regression suite
2. Compute quality metrics
3. Compare against baselines
4. Block or alert on regressions
5. Store results for trend analysis

---

## 11. Evaluation Dashboards

Dashboards should show:
- Quality trends over time
- Breakdowns by model version
- Token and cost trends
- Latency distributions
- Error and refusal rates

> Trends reveal problems that single evaluations cannot.

---

## 12. Key Learnings (Hard-Won Lessons)

- Single metrics lie — use multiple dimensions
- Most failures come from prompt + context, not model weights
- Regression testing is more important than absolute scores
- Logging must be intentional or it becomes useless
- Cost is a quality signal, not just a finance metric
- Evaluation data must evolve with users and products

---

## 13. How This Document Should Be Used by an AI

This document can be used to:
- Train an AI agent on LLM evaluation principles
- Guide autonomous prompt or model optimisation
- Act as an internal "LLMOps playbook"
- Seed reinforcement learning reward signals
- Power automated quality gates and decision-making

This is not theory — it is operational knowledge.
