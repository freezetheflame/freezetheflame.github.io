# Concepts

## Memory Harness

A task-specific memory system design that includes storage shape, read/write APIs, retrieval logic, and update behavior. The M* paper argues that the best harness depends on the task rather than on a universal memory backend.

## Project-Memory-Guided Testing

A testing-agent design pattern where repository-specific memory guides test command selection, failure diagnosis, generated-test filtering, and regression validation across repeated tasks.

## Execution-Grounded Testing Memory

Testing memory should be tied to commands, outputs, validation results, flakiness evidence, and regression scope. This distinguishes it from generic agent memory that mainly stores summaries or retrieved facts.
