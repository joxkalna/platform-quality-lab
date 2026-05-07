# What is agent?

This is widly discussed in the AI community, but we will settle with majority - "An LLM agent runs tools in a loop to achieve goals."

## Let digiest above statement in parts:

This is the pattern baked into many LLM APIs as tools or function calls - the LLM is given ability to request an actions to be executed by its
harness, and the outcome of those tools is fed back into the model so it can continue to reasn through and solve the given problem. 

"To achieve a goal" reflects that these are not infinite loops - there is a stopping condition.

If a technical implementer tells you - they are building an "agent", we are going to assume they mean they are wiring up tools to an LLM in order to achieve goals using those tools in a bounded loop.


