import Anthropic from '@anthropic-ai/sdk'
import type { MessageParam } from '@anthropic-ai/sdk/resources'

const apiKey = process.env.ANTHROPIC_API_KEY

if (!apiKey) {
  throw new Error('ANTHROPIC_API_KEY is not set in environment variables')
}

// Default model configuration
const DEFAULT_MODEL = 'claude-sonnet-4-20250514'

// Create and export the Anthropic client instance
export const anthropic = new Anthropic({
  apiKey,
})

/**
 * Helper function to call Claude API with a simple prompt
 * @param prompt - The user prompt to send to Claude
 * @param options - Optional parameters for the API call
 * @returns The response text from Claude
 * @throws Error if the API call fails
 */
export async function callClaude(
  prompt: string,
  options?: {
    model?: string
    maxTokens?: number
    system?: string
    temperature?: number
  }
): Promise<string> {
  try {
    const model = options?.model || DEFAULT_MODEL
    const messages: MessageParam[] = [
      {
        role: 'user',
        content: prompt,
      },
    ]

    const response = await anthropic.messages.create({
      model,
      max_tokens: options?.maxTokens || 1024,
      system: options?.system,
      temperature: options?.temperature,
      messages: messages as any,
    })

    // Extract text content from the response
    const textContent = response.content
      .filter((item): item is { type: 'text'; text: string } => item.type === 'text')
      .map((item) => item.text)
      .join('')

    if (!textContent) {
      throw new Error('No text content in Claude response')
    }

    return textContent
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      throw new Error(`Anthropic API Error: ${error.message} (Status: ${error.status})`)
    }
    if (error instanceof Error) {
      throw new Error(`Failed to call Claude: ${error.message}`)
    }
    throw new Error('Unknown error occurred while calling Claude API')
  }
}

/**
 * Create a new Anthropic client instance (alternative to using the exported instance)
 */
export function createAnthropicClient(): Anthropic {
  return anthropic
}

