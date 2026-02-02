# Strategy Eligibility Rules Reference

This document lists all tax strategies and their eligibility requirements.

## Tier 1: Quick Wins (Auto-Applied When Eligible)

### 1. Augusta Loophole (`augusta_loophole`)
**Tier:** 1 | **Auto-Apply:** Yes

**Eligibility Rules (ALL required):**
- `business.has_business === true`
- `business.net_profit >= 1` (positive business profit)
- `business.entity_type IN ["SOLE_PROP", "PARTNERSHIP", "S_CORP", "LLC"]`

**Income Gate:** None

---

### 2. Medical Reimbursement Plan (`medical_reimbursement`)
**Tier:** 1 | **Auto-Apply:** Yes

**Eligibility Rules (ALL required):**
- `business.has_business === true`
- `business.net_profit >= 1` (positive business profit)

**Income Gate:** None

---

### 3. 401(k) Employee Deferral (`k401`)
**Tier:** 1 | **Auto-Apply:** Yes

**Eligibility Rules (ALL required):**
- `business.has_business === true`
- `business.net_profit >= 1` (positive business profit)

**Income Gate:** None

---

### 4. Hiring Children (`hiring_children`)
**Tier:** 1 | **Auto-Apply:** Yes

**Eligibility Rules (ALL required):**
- `business.has_business === true`
- `business.net_profit >= 1` (positive business profit)
- `personal.children_0_17 > 0` (must have children)

**Income Gate:** None

**Note:** Requires wage amount confirmation. Strategy marked as `needsConfirmation` when children count > 0.

---

### 5. S-Corp Conversion (`s_corp_conversion`)
**Tier:** 1 | **Auto-Apply:** Yes

**Eligibility Rules (ALL required):**
- `business.has_business === true`
- `business.entity_type IN ["SOLE_PROP", "PARTNERSHIP", "LLC"]`
- `business.net_profit >= 100000` (at least $100,000)
- `business.entity_type !== "S_CORP"` (not already converted)

**Income Gate:** None

---

## Tier 2: Bigger Opportunities (What-If Scenarios Only, Never Auto-Applied)

### 6. Cash Balance Plan (`cash_balance_plan`)
**Tier:** 2 | **Auto-Apply:** No

**Eligibility Rules (ALL required):**
- `business.has_business === true`
- `business.net_profit >= 1` (positive business profit)
- `business.net_profit >= 200000` (at least $200,000)
- `business.employees_count <= 5`

**Income Gate:** None (business net profit gate is in eligibility rules)

---

### 7. Short-Term Rental + Cost Segregation (`short_term_rental`)
**Tier:** 2 | **Auto-Apply:** No

**Eligibility Rules (ONE of the following must pass):**
- `personal.income_excl_business >= 1` (positive non-business income)
- `business.net_profit >= 1` (positive business profit)

**Income Gate:** None

---

### 8. Leveraged Charitable (`leveraged_charitable`)
**Tier:** 2 | **Auto-Apply:** No

**Eligibility Rules (ONE of the following must pass):**
- `personal.income_excl_business >= 1` (positive non-business income)
- `business.net_profit >= 1` (positive business profit)

**Income Gate:** `baseline.taxableIncome >= $833,000`

---

### 9. RTU Program (`rtu_program`)
**Tier:** 2 | **Auto-Apply:** No

**Eligibility Rules (ONE of the following must pass):**
- `personal.income_excl_business >= 1` (positive non-business income)
- `business.net_profit >= 1` (positive business profit)

**Income Gate:** `baseline.taxableIncome >= $350,000`

---

### 10. Film Equity (`film_credits`)
**Tier:** 2 | **Auto-Apply:** No

**Eligibility Rules (ONE of the following must pass):**
- `personal.income_excl_business >= 1` (positive non-business income)
- `business.net_profit >= 1` (positive business profit)

**Income Gate:** `baseline.taxableIncome >= $500,000`

---

## Quick Reference by Entity Type

### SOLE_PROP
- ✅ Augusta Loophole
- ✅ Medical Reimbursement
- ✅ 401(k)
- ✅ Hiring Children
- ✅ S-Corp Conversion (if net profit ≥ $100k)
- ✅ Cash Balance Plan (what-if, if net profit ≥ $200k, ≤5 employees)
- ✅ All Tier 2 strategies (what-if only)

### PARTNERSHIP
- ✅ Augusta Loophole
- ✅ Medical Reimbursement
- ✅ 401(k)
- ✅ Hiring Children
- ✅ S-Corp Conversion (if net profit ≥ $100k)
- ✅ Cash Balance Plan (what-if, if net profit ≥ $200k, ≤5 employees)
- ✅ All Tier 2 strategies (what-if only)

### S_CORP
- ✅ Augusta Loophole
- ✅ Medical Reimbursement
- ✅ 401(k)
- ✅ Hiring Children
- ❌ S-Corp Conversion (already converted)
- ✅ Cash Balance Plan (what-if, if net profit ≥ $200k, ≤5 employees)
- ✅ All Tier 2 strategies (what-if only)

### LLC
- ✅ Augusta Loophole
- ✅ Medical Reimbursement
- ✅ 401(k)
- ✅ Hiring Children
- ✅ S-Corp Conversion (if net profit ≥ $100k)
- ✅ Cash Balance Plan (what-if, if net profit ≥ $200k, ≤5 employees)
- ✅ All Tier 2 strategies (what-if only)

### C_CORP
- ❌ Augusta Loophole (not eligible for C_CORP)
- ✅ Medical Reimbursement
- ✅ 401(k)
- ✅ Hiring Children
- ❌ S-Corp Conversion (must convert from SOLE_PROP/PARTNERSHIP/LLC)
- ✅ Cash Balance Plan (what-if, if net profit ≥ $200k, ≤5 employees)
- ✅ All Tier 2 strategies (what-if only)

---

*Last updated: Based on two-tier system implementation*
