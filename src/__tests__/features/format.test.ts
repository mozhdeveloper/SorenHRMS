/**
 * Format Utils Tests — NexHRMS
 * Tests currency formatting, date formatting, phone validation, and initials
 */

import {
    formatCurrency,
    formatDate,
    formatTime,
    getInitials,
    validatePhone,
    formatPhoneDisplay,
} from "@/lib/format";

// ══════════════════════════════════════════════════════════
// Currency Formatting (PH Peso)
// ══════════════════════════════════════════════════════════

describe("formatCurrency", () => {
    it("should format as Philippine Peso", () => {
        const result = formatCurrency(25000);
        expect(result).toContain("25,000");
        // Should have PHP symbol or ₱
        expect(result).toMatch(/₱|PHP/);
    });

    it("should handle zero", () => {
        const result = formatCurrency(0);
        expect(result).toContain("0");
    });

    it("should handle large amounts", () => {
        const result = formatCurrency(1500000);
        expect(result).toContain("1,500,000");
    });

    it("should handle small amounts", () => {
        const result = formatCurrency(100);
        expect(result).toContain("100");
    });
});

// ══════════════════════════════════════════════════════════
// Date Formatting
// ══════════════════════════════════════════════════════════

describe("formatDate", () => {
    it("should format ISO date to readable format", () => {
        const result = formatDate("2026-04-06");
        expect(result).toContain("Apr");
        expect(result).toContain("06");
        expect(result).toContain("2026");
    });

    it("should return original string on invalid date", () => {
        const result = formatDate("not-a-date");
        expect(result).toBe("not-a-date");
    });

    it("should handle full ISO datetime", () => {
        const result = formatDate("2026-01-15T09:00:00.000Z");
        expect(result).toContain("Jan");
        expect(result).toContain("15");
    });
});

// ══════════════════════════════════════════════════════════
// Time Formatting
// ══════════════════════════════════════════════════════════

describe("formatTime", () => {
    it("should format 24h time to 12h AM/PM", () => {
        const result = formatTime("14:30");
        expect(result).toContain("02:30");
        expect(result).toMatch(/PM/i);
    });

    it("should handle midnight", () => {
        const result = formatTime("00:00");
        expect(result).toMatch(/12:00/);
        expect(result).toMatch(/AM/i);
    });

    it("should handle noon", () => {
        const result = formatTime("12:00");
        expect(result).toMatch(/12:00/);
        expect(result).toMatch(/PM/i);
    });

    it("should return original string on invalid time", () => {
        const result = formatTime("invalid");
        expect(result).toBe("invalid");
    });
});

// ══════════════════════════════════════════════════════════
// Initials
// ══════════════════════════════════════════════════════════

describe("getInitials", () => {
    it("should extract two initials from full name", () => {
        expect(getInitials("Juan Dela Cruz")).toBe("JD");
    });

    it("should handle single name", () => {
        expect(getInitials("Juan")).toBe("J");
    });

    it("should cap at 2 characters", () => {
        expect(getInitials("Maria Luisa Santiago Garcia")).toBe("ML");
    });

    it("should uppercase initials", () => {
        expect(getInitials("juan dela cruz")).toBe("JD");
    });
});

// ══════════════════════════════════════════════════════════
// Phone Validation (PH Format)
// ══════════════════════════════════════════════════════════

describe("validatePhone", () => {
    describe("PH Mobile Numbers", () => {
        it("should validate +63 format", () => {
            const result = validatePhone("+639171234567");
            expect(result.valid).toBe(true);
            expect(result.type).toBe("mobile");
            expect(result.formatted).toBe("+639171234567");
        });

        it("should validate 0 prefix format and normalize to +63", () => {
            const result = validatePhone("09171234567");
            expect(result.valid).toBe(true);
            expect(result.type).toBe("mobile");
            expect(result.formatted).toBe("+639171234567");
        });

        it("should handle spaces and dashes", () => {
            const result = validatePhone("+63 917 123 4567");
            expect(result.valid).toBe(true);
            expect(result.type).toBe("mobile");
        });

        it("should handle dashes", () => {
            const result = validatePhone("0917-123-4567");
            expect(result.valid).toBe(true);
            expect(result.type).toBe("mobile");
        });
    });

    describe("PH Landline Numbers", () => {
        it("should validate Metro Manila landline +63 2 format", () => {
            const result = validatePhone("+6328123456");
            expect(result.valid).toBe(true);
            expect(result.type).toBe("landline");
        });

        it("should validate provincial landline", () => {
            const result = validatePhone("+63341234567");
            expect(result.valid).toBe(true);
            expect(result.type).toBe("landline");
        });
    });

    describe("International Numbers", () => {
        it("should validate US number", () => {
            const result = validatePhone("+12025551234");
            expect(result.valid).toBe(true);
            expect(result.type).toBe("international");
        });

        it("should validate UK number", () => {
            const result = validatePhone("+442071234567");
            expect(result.valid).toBe(true);
            expect(result.type).toBe("international");
        });
    });

    describe("Invalid Numbers", () => {
        it("should reject too-short number", () => {
            const result = validatePhone("12345");
            expect(result.valid).toBe(false);
        });

        it("should reject letters", () => {
            const result = validatePhone("abc1234567");
            expect(result.valid).toBe(false);
        });

        it("should treat empty/null as valid (optional field)", () => {
            expect(validatePhone("").valid).toBe(true);
            expect(validatePhone(null).valid).toBe(true);
            expect(validatePhone(undefined).valid).toBe(true);
        });
    });
});

// ══════════════════════════════════════════════════════════
// Phone Display Formatting
// ══════════════════════════════════════════════════════════

describe("formatPhoneDisplay", () => {
    it("should format PH mobile with spaces", () => {
        const result = formatPhoneDisplay("+639171234567");
        expect(result).toBe("+63 917 123 4567");
    });

    it("should handle 0-prefix input", () => {
        const result = formatPhoneDisplay("09171234567");
        expect(result).toBe("+63 917 123 4567");
    });

    it("should return empty string for null/undefined", () => {
        expect(formatPhoneDisplay(null)).toBe("");
        expect(formatPhoneDisplay(undefined)).toBe("");
    });

    it("should return original string for invalid phone", () => {
        const result = formatPhoneDisplay("invalid");
        expect(result).toBe("invalid");
    });
});
