package lcm

// export_test.go exports unexported functions for use in lcm_test (package lcm_test).

// ExtractFileIDsExported wraps the unexported extractFileIDs for testing (IT-19).
func ExtractFileIDsExported(content string) []string {
	return extractFileIDs(content)
}

// EscNullExported wraps the unexported escNull for testing (IT-35).
func EscNullExported(s string) string {
	return escNull(s)
}

// GenerateSummaryIDExported wraps the unexported generateSummaryID for testing.
func GenerateSummaryIDExported(content string) string {
	return generateSummaryID(content)
}

// GenerateCondensedIDExported wraps the unexported generateCondensedID for testing.
func GenerateCondensedIDExported(content string) string {
	return generateCondensedID(content)
}
